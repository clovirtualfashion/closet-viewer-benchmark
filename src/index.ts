import {Browser, LaunchOptions, Page} from "puppeteer";
import * as P from "path";
import * as path from "path";
import * as fs from "fs";
import got from "got";
import {v4 as uuidv4} from "uuid";
import * as U from "url";
import {pathToFileURL, URL} from "url";
import * as D from "io-ts/Decoder";
import {from, Observable, zip} from "rxjs";
import {map, publish, reduce, share, take, tap, toArray} from "rxjs/operators";
import os from "os";
import {hookDomain, measureCue, template, templateForFPS, templateSrest, zrestTraceTemplate} from "./template";

import {Either, getApplyMonoid, isLeft, isRight, left, right} from "fp-ts/Either";
import {identity, pipe} from "fp-ts/lib/function";
import {ReaderTaskEither} from "fp-ts/ReaderTaskEither";
import {bracket, TaskEither, tryCatchK} from "fp-ts/TaskEither";
import {array, either, option, reader, readerEither, readerTaskEither, readonlyArray, record, taskEither} from "fp-ts";
import {observable, observableEither} from "fp-ts-rxjs";
import {fromTaskEither, ObservableEither, toTaskEither} from "fp-ts-rxjs/lib/ObservableEither";
import {D_SRest, SRest} from "./types";
import fetch from "node-fetch";
import {none, Option, some} from "fp-ts/Option";
import {compact} from "fp-ts-rxjs/lib/Observable";
import {ReaderEither} from "fp-ts/ReaderEither";
import {
    createNewIncognitoPage,
    createNewPage,
    createTmpHTMLURL_JSX,
    PPEvent,
    runWithBrowser,
    streamPageEvents
} from "page-request-emitter";
import {capDelay, exponentialBackoff, limitRetries, monoidRetryPolicy, RetryStatus} from "retry-ts";
import {retrying} from "retry-ts/lib/Task";
import {log} from "fp-ts/Console";
import {spawnSync} from "child_process";
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getStructMonoid, Monoid, monoidSum} from "fp-ts/Monoid";
import {sequenceT} from "fp-ts/Apply";

export class Measurement {
    constructor(public unit: string, public value: number) {
    }
}

export type Result = Record<string, Record<string, Measurement>>;

const fpsResponse = D.type({
    fps: D.number,
});

const launchOption: LaunchOptions = {
    args: ["--no-sandbox", "--disable-web-security", "--use-gl=egl"]
}

function fetchJSON(url: string) {
    return fetch(url).then(x => x.text()).then(JSON.parse)
}

export function benchmarkSrestLoading(liburl: U.URL, srestJsonURLs: readonly string[]) {
    return pipe(
        srestJsonURLs,
        readonlyArray.map(tryCatchK(fetchJSON, identity)),
        readonlyArray.map(taskEither.chainEitherKW(D_SRest.decode)),
        taskEither.sequenceArray,
        taskEither.chainW(srests => {
            // return withCachedSrests(srests, (cachedSrests)=> benchmarkPageMetric(liburl, templateSrest(liburl, cachedSrests), "srest loading benchmarking"))
            return benchmarkPageMetric(liburl, templateSrest(liburl, srests), "srest loading benchmarking", srestJsonURLs.length)
        })
    )
}

export function retryN<E, A>(count: number, taskMaker: () => TaskEither<E, A>) {
    const logDelay = (status: RetryStatus) =>
        taskEither.rightIO(
            log(
                pipe(
                    status.previousDelay,
                    option.map(delay => `retrying in ${delay} milliseconds...`),
                    option.getOrElse(() => 'first attempt...')
                )
            )
        )

    return retrying(
        capDelay(1000 * 60 * 3, monoidRetryPolicy.concat(exponentialBackoff(30000), limitRetries(count))),
        status =>
            pipe(
                logDelay(status),
                taskEither.apSecond(taskMaker())
            ),
        either.isLeft
    )

}

const metricSumMonoid = getStructMonoid({
    Timestamp: monoidSum,
    /** Number of documents in the page. */
    Documents: monoidSum,
    /** Number of events in the page. */
    JSEventListeners: monoidSum,
    /** Number of DOM nodes in the page. */
    Nodes: monoidSum,
    /** Total monoidSum of full or partial page layout. */
    LayoutCount: monoidSum,
    /** Total monoidSum of page style recalculations. */
    RecalcStyleCount: monoidSum,
    /** Combined durations of all page layouts. */
    LayoutDuration: monoidSum,
    /** Combined duration of all page style recalculations. */
    RecalcStyleDuration: monoidSum,
    /** Combined duration of JavaScript execution. */
    ScriptDuration: monoidSum,
    /** Combined duration of all tasks performed by the browser. */
    TaskDuration: monoidSum,
    /** Used JavaScript heap size. */
    JSHeapUsedSize: monoidSum,
    /** Total JavaScript heap size. */
    JSHeapTotalSize: monoidSum,
})
const monoidMax: Monoid<number> = {
    concat: Math.max,
    empty: 0
}
const monoidMin: Monoid<number> = {
    concat: Math.min,
    empty: Number.MAX_VALUE
}
const metricMaxMonoid = getStructMonoid({
    Timestamp: monoidMax,
    /** Number of documents in the page. */
    Documents: monoidMax,
    /** Number of frames in the page. */
    JSEventListeners: monoidMax,
    /** Number of DOM nodes in the page. */
    Nodes: monoidMax,
    /** Total monoidMax of full or partial page layout. */
    LayoutCount: monoidMax,
    /** Total monoidMax of page style recalculations. */
    RecalcStyleCount: monoidMax,
    /** Combined durations of all page layouts. */
    LayoutDuration: monoidMax,
    /** Combined duration of all page style recalculations. */
    RecalcStyleDuration: monoidMax,
    /** Combined duration of JavaScript execution. */
    ScriptDuration: monoidMax,
    /** Combined duration of all tasks performed by the browser. */
    TaskDuration: monoidMax,
    /** Used JavaScript heap size. */
    JSHeapUsedSize: monoidMax,
    /** Total JavaScript heap size. */
    JSHeapTotalSize: monoidMax,
})

export function benchmarkPageMetric(liburl: U.URL, jsx: JSX.Element, benchmarkName: string, modelCount: number) {
    console.log("liburl", liburl);
    const readMetricFromPage = (page: Page): TaskEither<unknown, Result> => {
        const events = streamPageEvents(page, createTmpHTMLURL_JSX(jsx))({
            filter: (r) => r.url().startsWith(hookDomain),
            alterResponse: () => none,
            debugResponse() {
            }
        }).pipe(stopWhenError, map(either.map(logEvent)), share());

        const durationMon = getApplyMonoid(getStructMonoid({
            start: monoidMin, end: monoidMax
        }))
        const timeOb = events.pipe(
            observableEither.map(() => Date.now()),
            observableEither.map(now => ({
                start: now,
                end: now
            })),
            reduce(durationMon.concat, durationMon.empty),
            observableEither.map(duration => duration.end - duration.start)
        )
        const timeTask = toTaskEither(timeOb);
        const metrics = events.pipe(
            observableEither.map(event => {
                switch (event._tag) {
                    case "RequestIntercept":
                        if (event.request.postData() === measureCue) {
                            const p = tryCatchK(() => page.metrics(), identity)();
                            return some(p);
                        }
                }
                return none
            }),
            map(either.sequence(option.option)),
            compact,
            observableEither.chain(fromTaskEither),
            tap(eth => {
                if (isRight(eth)) {
                    console.log("Metrics !", eth.right);
                }
            })
        )

        const sumMon = getApplyMonoid(metricSumMonoid);
        const maxMon = getApplyMonoid(metricMaxMonoid)
        const measurementMapper = (key: string, val: number): Measurement => {
            switch (key) {
                case "JSHeapUsedSize":
                    return new Measurement("bytes", val);
                case "JSHeapTotalSize":
                    return new Measurement("bytes", val);
                case "TaskDuration":
                    return new Measurement("s", val);
                default:
                    return new Measurement("?", val);
            }
        }
        const metricPairOb = metrics.pipe(
            publish(multicasted => zip(
                // Average
                multicasted.pipe(reduce(sumMon.concat, sumMon.empty),),
                // Max
                multicasted.pipe(reduce(maxMon.concat, maxMon.empty),)
            )),
            map(([averageEither, maxEither]) => {
                return sequenceT(either.either)(averageEither, maxEither)
            }))
        const metricPairTask = toTaskEither(metricPairOb);


        return pipe(
            sequenceT(taskEither.taskEither)(metricPairTask, timeTask),
            taskEither.map(([[average, max], time]):Result => {
                const averageKeyChanged = pipe(
                    average,
                    record.map(v => v / modelCount),
                    record.mapWithIndex(measurementMapper),
                    record.reduceRightWithIndex({} as Record<string, Measurement>, (k, v, b) => {
                        b[k + "_Mean"] = v;
                        return b;
                    })
                )
                const maxKeyChanged = pipe(
                    max,
                    record.mapWithIndex(measurementMapper),
                    record.reduceRightWithIndex({} as Record<string, Measurement>, (k, v, b) => {
                        b[k + "_Max"] = v;
                        return b;
                    })
                )
                return {
                    [benchmarkName]: {
                        ...averageKeyChanged,
                        ...maxKeyChanged,
                        Time: new Measurement("ms", time)
                    },
                }
            })
        );
    }
    const browserReader = (browser: Browser): TaskEither<Error, Result> => {
        return pipe(
            createNewIncognitoPage()(browser),
            taskEither.chain(readMetricFromPage),
            taskEither.mapLeft((err): Error => {
                if (err instanceof Error) {
                    return err
                } else {
                    console.error(err);
                    return new Error("Metric Benchmarking failed");
                }
            })
        )
    }
    return runWithBrowser(launchOption, browserReader);
}

export function benchmarkFPS(libURL: U.URL, heavyZrestURL: U.URL, viewWidth: number, viewHeight: number, timeMS: number) {
    const jsx = templateForFPS(libURL, heavyZrestURL, timeMS, viewWidth, viewHeight)
    const pageurl = createTmpHTMLURL_JSX(jsx);
    const pageReader = (page: Page) => {
        const eventStream = streamPageEvents(page, pageurl)({
            filter: r => r.url().startsWith(hookDomain),
            alterResponse: () => none,
            debugResponse: () => {
            }
        });
        return pipe(
            stopWhenError(eventStream),
            observableEither.map((xxx): Option<string | undefined> => {
                switch (xxx._tag) {
                    case "Log":
                        console.log(xxx.message);
                        return none;
                    case "RequestIntercept":
                        return some(xxx.request.postData());
                }
            }),
            map(either.sequence(option.option)),
            compact,
            take(1),
            toTaskEither,
            taskEither.chainEitherKW(D.string.decode),
            taskEither.map(JSON.parse),
            taskEither.chainEitherKW(fpsResponse.decode),
            taskEither.map((decoded): Result => ({
                "zrest orbiting fps benchmarking": {
                    mean: new Measurement("fps", decoded.fps),
                },
            }))
        );
    }
    return runWithBrowser(launchOption, (browser: Browser) => {
        return pipe(
            createNewPage()(browser),
            taskEither.chain(pageReader),
            taskEither.mapLeft(err => {
                if (err instanceof Error) {
                    return err
                } else {
                    console.error(err);
                    return new Error("Failed")
                }
            })
        )
    })
}

function withDownloadedZrests<_A>(zresturls: U.URL[], task: ReaderTaskEither<readonly U.URL[], Error, _A>) {
    const zrestsDir = P.resolve(os.tmpdir(), `zrests-${uuidv4()}`);
    fs.mkdirSync(zrestsDir, {recursive: true});
    console.log("tmp directory is made: " + zrestsDir);

    const downloadObservable = from(zresturls).pipe(
        map(url => cacheFile_downloadDir(url.toString())(zrestsDir)),
        observable.chain(fromTaskEither),
        toArray(),
        map(either.sequenceArray),
    )
    const downloadTask = toTaskEither(downloadObservable);
    const releaseTask = () => {
        console.log("removing temporary directory ", zrestsDir, " ...");
        return taskEither.of<Error, void>(fs.rmdirSync(zrestsDir, {recursive: true}))
    }
    return bracket(downloadTask, task, releaseTask)
}

export function benchmarkZrestLoading(libURL: U.URL, zrestURLs: U.URL[], benchmarkName:string): TaskEither<Error, Result> {
    console.log("Loading benchmarking start");
    return withDownloadedZrests(zrestURLs, cachedzrests => {
        return benchmarkPageMetric(libURL, template(libURL, cachedzrests), benchmarkName, zrestURLs.length)
    })
}

export async function benchmarkBundleSize(libURL: U.URL) {
    console.log("Bundle size bechmarking start");
    return got(libURL.toString()).then(x => x.headers["content-length"]).then((x): Either<Error, Result> => {
        if (x === undefined) {
            return left(new Error("Unable to get content-length"));
        } else {
            console.log("Bundle size benchmarking end");
            return right({
                "Bundle size test": {
                    "Bundle Size": new Measurement("mb", Number(x) / 1024 / 1024)
                }
            });
        }
    })
}

function stopWhenError<_A>(oe: ObservableEither<Error, _A>): ObservableEither<Error, _A> {
    return new Observable<Either<Error, _A>>(subscriber => {
        oe.subscribe({
            next(either) {
                if (!subscriber.closed) {
                    subscriber.next(either);
                    if (isLeft(either)) {
                        subscriber.complete();
                    }
                }
            },
            complete() {
                subscriber.complete();
            },
            error(err) {
                subscriber.error(err);
            }
        })
    })
}

const gotPromise = (url: string) => got(url).then(response => response.rawBody);

const downloadBuffer = tryCatchK(gotPromise, err => {
    if (err instanceof Error) {
        return err
    } else {
        console.log(err);
        return new Error("download fail");
    }
});

function genTmpPathForCache(urlstr: string): ReaderEither<string, Error, string> {
    return (downloadDir: string) => {
        try {
            const url = new URL(urlstr);
            const newDir = P.resolve(downloadDir, uuidv4());
            fs.mkdirSync(newDir);
            const newFileName = P.basename(url.pathname);
            return right(P.resolve(newDir, newFileName));
        } catch (e) {
            if (e instanceof Error) return left(e);

            console.error(e);
            return left(new Error("Generating tmp path fail"));
        }
    }
}

function cacheFile_downloadDir(urlstr: string): ReaderTaskEither<string, Error, URL> {
    console.log("caching", urlstr);
    return pipe(
        genTmpPathForCache(urlstr),
        readerEither.map(newPath => {
            console.log("caching location:", newPath)
            return pipe(
                downloadBuffer(urlstr),
                taskEither.map(buffer => {
                    fs.writeFileSync(newPath, buffer)
                    return pathToFileURL(newPath)
                })
            )
        }),
        reader.map(either.sequence(taskEither.taskEither)),
        readerTaskEither.chainEitherK(xxx => xxx)
    )
}

function cacheSrest(srest: SRest) {
    const cache = (x: string[]) => pipe(
        x,
        array.map(cacheFile_downloadDir),
        readerTaskEither.sequenceArray,
        readerTaskEither.map(urls => urls.map(url => url.toString()))
    )

    return pipe(
        srest,
        record.map(cache),
        record.sequence(readerTaskEither.readerTaskEither),
        readerTaskEither.map(r => r as SRest)
    )
}

export function withCachedSrests<_V>(srests: readonly SRest[], task: ReaderTaskEither<readonly SRest[], Error, _V>) {
    const tmpDir = P.resolve(os.tmpdir(), `srests-${uuidv4()}`);
    console.log("Creating new srests cache location", tmpDir);
    fs.mkdirSync(tmpDir, {recursive: true});

    const cacheTask = pipe(
        srests,
        readonlyArray.map(cacheSrest),
        readonlyArray.sequence(readerTaskEither.readerTaskEither),
    )(tmpDir);
    const mainTask = pipe(
        task,
    )
    return bracket(
        cacheTask,
        mainTask,
        () => {
            console.log("Releasing cached srests", tmpDir);
            return taskEither.of(fs.rmdirSync(tmpDir, {recursive: true}))
        })
}

const startTracing = tryCatchK((page: Page) => page.tracing.start({}), identity);
const stopTracing = tryCatchK((page: Page) => page.tracing.stop(), identity);
const s3 = new S3Client({region: 'ap-northeast-2'});

function keyToURL(key: string, bucket: string): string {
    const path = key.split("/").map(encodeURIComponent).join("/")
    const safebucket = encodeURIComponent(bucket)
    return `https://${safebucket}.s3.ap-northeast-2.amazonaws.com/${path}`
}

const uploadTask = tryCatchK((buffer: Buffer, bucket: string, key: string) => {
    return s3.send(new PutObjectCommand({
        Body: buffer,
        ContentLength: buffer.length,
        Bucket: bucket,
        GrantRead: 'uri="http://acs.amazonaws.com/groups/global/AllUsers"',
        ContentType: "text/html",
        Key: key
    }))
}, identity);

export function traceZrestLoading(liburl: URL, zrestURL: URL, bucket: string, key: string) {
    console.log("Trace zrest start", liburl);
    const browserReader = (browser: Browser) => {
        const pageTask = createNewIncognitoPage()(browser);
        const htmlurl = createTmpHTMLURL_JSX(zrestTraceTemplate(liburl, zrestURL));
        return pipe(
            pageTask,
            taskEither.chainFirst(startTracing),
            taskEither.chainFirstW(page => {
                const events = streamPageEvents(page, htmlurl)({
                    filter: r => r.url().startsWith(hookDomain),
                    alterResponse: () => none,
                    debugResponse: () => {
                    }
                }).pipe(stopWhenError, map(either.map(logEvent)))
                return toTaskEither(events);
            }),
            taskEither.chain(stopTracing),
            taskEither.chainW((buffer): TaskEither<Error, string> => {
                const uuid = uuidv4().toString()
                const jsonname = uuid + ".json";
                fs.writeFileSync(jsonname, buffer);
                const htmlname = uuid + ".html";
                const result = spawnSync(path.resolve(__dirname, "..", "catapult", "tracing", "bin", "trace2html"), [jsonname, "--output=" + htmlname]);
                const stdout = result.stdout as any;
                if (stdout instanceof Buffer) {
                    console.log("CATAPULT", stdout.toString("utf8"))
                } else if (typeof stdout === 'string') {
                    console.log("CATAPULT", stdout);
                }
                const status = result.status;
                console.log("CATAPULT status", result.status);

                if (status !== null) {
                    if (status === 0) {
                        return taskEither.right(htmlname);
                    } else {
                        return taskEither.left(new Error("CATAPULT failed with status " + status.toString()))
                    }
                } else {
                    return taskEither.left(new Error("CATAPULT failed with status null"));
                }
            }),
            taskEither.chainW(htmlname => {
                const htmlbuffer = fs.readFileSync(htmlname);
                return uploadTask(htmlbuffer, bucket, key);
            }),
            taskEither.map(_ => {
                return keyToURL(key, bucket);
            }),
            taskEither.mapLeft(e => {
                if (e instanceof Error) {
                    return e
                } else {
                    console.error(e);
                    return new Error("failed")
                }
            }),
        )
    }
    return runWithBrowser(launchOption, browserReader);
}

function logEvent(e: PPEvent) {
    switch (e._tag) {
        case "Log":
            console.log("PPEvent", "Log", e.message);
            break;
        case "RequestIntercept":
            console.log("PPEvent", "Request", e);
            break;
    }
    return e;
}

