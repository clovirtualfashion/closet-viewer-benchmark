import { Browser, LaunchOptions, Page } from "puppeteer";
import * as path from "path";
import * as fs from "fs";
import got from "got";
import { v4 as uuidv4 } from "uuid";
import * as U from "url";
import { URL } from "url";
import * as D from "io-ts/Decoder";
import { zip } from "rxjs";
import { map, publish, reduce, share, take, tap } from "rxjs/operators";
import {
  hookDomain,
  measureCue,
  template,
  templateForFPS,
  templateSrest,
  zrestTraceTemplate,
} from "./template";

import { Either, getApplyMonoid, isRight, left, right } from "fp-ts/Either";
import { identity, pipe } from "fp-ts/lib/function";
import { TaskEither, tryCatchK } from "fp-ts/TaskEither";
import { either, option, readonlyArray, record, taskEither } from "fp-ts";
import { observableEither } from "fp-ts-rxjs";
import { fromTaskEither, toTaskEither } from "fp-ts-rxjs/lib/ObservableEither";
import {
  D_SRest,
  metricMaxMonoid,
  metricSumMonoid,
  monoidMax,
  monoidMin,
} from "./types";
import fetch from "node-fetch";
import { none, Option, some } from "fp-ts/Option";
import { compact } from "fp-ts-rxjs/lib/Observable";
import {
  createNewIncognitoPage,
  createNewPage,
  createTmpHTMLURL_JSX,
  runWithBrowser,
  streamPageEvents,
} from "page-request-emitter";
import { spawnSync } from "child_process";
import { getStructMonoid } from "fp-ts/Monoid";
import { sequenceT } from "fp-ts/Apply";
import { logEvent, stopWhenError, withDownloadedZrests } from "./functions";

export class Measurement {
  constructor(public unit: string, public value: number) {}
}

export type Result = Record<string, Record<string, Measurement>>;

const fpsResponse = D.type({
  fps: D.number,
});

const launchOption: LaunchOptions = {
  args: ["--no-sandbox", "--disable-web-security", "--use-gl=egl"],
};

function fetchJSON(url: string) {
  return fetch(url)
    .then((x) => x.text())
    .then(JSON.parse);
}

export function benchmarkSrestLoading(
  liburl: U.URL,
  srestJsonURLs: readonly string[]
) {
  return pipe(
    srestJsonURLs,
    readonlyArray.map(tryCatchK(fetchJSON, identity)),
    readonlyArray.map(taskEither.chainEitherKW(D_SRest.decode)),
    taskEither.sequenceArray,
    taskEither.chainW((srests) => {
      // return withCachedSrests(srests, (cachedSrests)=> benchmarkPageMetric(liburl, templateSrest(liburl, cachedSrests), "srest loading benchmarking"))
      return benchmarkPageMetric(
        liburl,
        templateSrest(liburl, srests),
        "srest loading benchmarking",
        srestJsonURLs.length
      );
    })
  );
}

export function benchmarkPageMetric(
  liburl: U.URL,
  jsx: JSX.Element,
  benchmarkName: string,
  modelCount: number
) {
  console.log("liburl", liburl);
  const readMetricFromPage = (page: Page): TaskEither<unknown, Result> => {
    const events = streamPageEvents(
      page,
      createTmpHTMLURL_JSX(jsx)
    )({
      filter: (r) => r.url().startsWith(hookDomain),
      alterResponse: () => none,
      debugResponse() {},
    }).pipe(stopWhenError, map(either.map(logEvent)), share());

    const durationMon = getApplyMonoid(
      getStructMonoid({
        start: monoidMin,
        end: monoidMax,
      })
    );
    const timeOb = events.pipe(
      observableEither.map(() => Date.now()),
      observableEither.map((now) => ({
        start: now,
        end: now,
      })),
      reduce(durationMon.concat, durationMon.empty),
      observableEither.map((duration) => duration.end - duration.start)
    );
    const timeTask = toTaskEither(timeOb);
    const metrics = events.pipe(
      observableEither.map((event) => {
        switch (event._tag) {
          case "RequestIntercept":
            if (event.request.postData() === measureCue) {
              const p = tryCatchK(() => page.metrics(), identity)();
              return some(p);
            }
        }
        return none;
      }),
      map(either.sequence(option.option)),
      compact,
      observableEither.chain(fromTaskEither),
      tap((eth) => {
        if (isRight(eth)) {
          // console.log("Metrics !", eth.right);
        }
      })
    );

    const sumMon = getApplyMonoid(metricSumMonoid);
    const maxMon = getApplyMonoid(metricMaxMonoid);
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
    };
    const metricPairOb = metrics.pipe(
      publish((multicasted) =>
        zip(
          // Average
          multicasted.pipe(reduce(sumMon.concat, sumMon.empty)),
          // Max
          multicasted.pipe(reduce(maxMon.concat, maxMon.empty))
        )
      ),
      map(([averageEither, maxEither]) => {
        return sequenceT(either.either)(averageEither, maxEither);
      })
    );
    const metricPairTask = toTaskEither(metricPairOb);

    return pipe(
      sequenceT(taskEither.taskEither)(metricPairTask, timeTask),
      taskEither.map(
        ([[average, max], time]): Result => {
          const averageKeyChanged = pipe(
            average,
            record.map((v) => v / modelCount),
            record.mapWithIndex(measurementMapper),
            record.reduceRightWithIndex(
              {} as Record<string, Measurement>,
              (k, v, b) => {
                b[k + "_Mean"] = v;
                return b;
              }
            )
          );
          const maxKeyChanged = pipe(
            max,
            record.mapWithIndex(measurementMapper),
            record.reduceRightWithIndex(
              {} as Record<string, Measurement>,
              (k, v, b) => {
                b[k + "_Max"] = v;
                return b;
              }
            )
          );
          return {
            [benchmarkName]: {
              ...averageKeyChanged,
              ...maxKeyChanged,
              Time: new Measurement("ms", time),
            },
          };
        }
      )
    );
  };
  const browserReader = (browser: Browser): TaskEither<Error, Result> => {
    return pipe(
      createNewIncognitoPage()(browser),
      taskEither.chain(readMetricFromPage),
      taskEither.mapLeft(
        (err): Error => {
          if (err instanceof Error) {
            return err;
          } else {
            console.error(err);
            return new Error("Metric Benchmarking failed");
          }
        }
      )
    );
  };
  return runWithBrowser(launchOption, browserReader);
}

export function benchmarkFPS(
  libURL: U.URL,
  heavyZrestURL: U.URL,
  viewWidth: number,
  viewHeight: number,
  timeMS: number
) {
  const jsx = templateForFPS(
    libURL,
    heavyZrestURL,
    timeMS,
    viewWidth,
    viewHeight
  );
  const pageurl = createTmpHTMLURL_JSX(jsx);
  const pageReader = (page: Page) => {
    const eventStream = streamPageEvents(
      page,
      pageurl
    )({
      filter: (r) => r.url().startsWith(hookDomain),
      alterResponse: () => none,
      debugResponse: () => {},
    });
    return pipe(
      stopWhenError(eventStream),
      observableEither.map(
        (xxx): Option<string | undefined> => {
          switch (xxx._tag) {
            case "Log":
              console.log(xxx.message);
              return none;
            case "RequestIntercept":
              return some(xxx.request.postData());
          }
        }
      ),
      map(either.sequence(option.option)),
      compact,
      take(1),
      toTaskEither,
      taskEither.chainEitherKW(D.string.decode),
      taskEither.map(JSON.parse),
      taskEither.chainEitherKW(fpsResponse.decode),
      taskEither.map(
        (decoded): Result => ({
          "zrest orbiting fps benchmarking": {
            mean: new Measurement("fps", decoded.fps),
          },
        })
      )
    );
  };
  return runWithBrowser(launchOption, (browser: Browser) => {
    return pipe(
      createNewPage()(browser),
      taskEither.chain(pageReader),
      taskEither.mapLeft((err) => {
        if (err instanceof Error) {
          return err;
        } else {
          console.error(err);
          return new Error("Failed");
        }
      })
    );
  });
}

export function benchmarkZrestLoading(
  libURL: U.URL,
  zrestURLs: U.URL[],
  benchmarkName: string
): TaskEither<Error, Result> {
  console.log("Loading benchmarking start");
  return withDownloadedZrests(zrestURLs, (cachedzrests) => {
    return benchmarkPageMetric(
      libURL,
      template(libURL, cachedzrests),
      benchmarkName,
      zrestURLs.length
    );
  });
}

export async function benchmarkBundleSize(libURL: U.URL) {
  console.log("Bundle size bechmarking start");
  return got(libURL.toString())
    .then((x) => x.headers["content-length"])
    .then(
      (x): Either<Error, Result> => {
        if (x === undefined) {
          return left(new Error("Unable to get content-length"));
        } else {
          console.log("Bundle size benchmarking end");
          return right({
            "Bundle size test": {
              "Bundle Size": new Measurement("mb", Number(x) / 1024 / 1024),
            },
          });
        }
      }
    );
}

const startTracing = tryCatchK(
  (page: Page) =>
    page.tracing.start({
      categories: [
        "gpu",
        "memory",
        "skia.gpu",
        "gpu.angle",
        "gpu.capture",
        "gpu.memory",
      ],
    }),
  identity
);
const stopTracing = tryCatchK((page: Page) => page.tracing.stop(), identity);

export function makeTraceZrestLoading({
  liburl,
  zrestURL,
}: {
  liburl: URL;
  zrestURL: URL;
}) {
  console.log("Trace zrest start", liburl);
  const browserReader = (browser: Browser) => {
    const pageTask = createNewIncognitoPage()(browser);
    const htmlurl = createTmpHTMLURL_JSX(zrestTraceTemplate(liburl, zrestURL));
    return pipe(
      pageTask,
      taskEither.chainFirst(startTracing),
      taskEither.chainFirstW((page) => {
        const events = streamPageEvents(
          page,
          htmlurl
        )({
          filter: (r) => r.url().startsWith(hookDomain),
          alterResponse: () => none,
          debugResponse: () => {},
        }).pipe(stopWhenError, map(either.map(logEvent)));
        return toTaskEither(events);
      }),
      taskEither.chain(stopTracing),
      taskEither.chainW(
        (buffer): TaskEither<Error, string> => {
          const uuid = uuidv4().toString();
          const jsonname = uuid + ".json";
          fs.writeFileSync(jsonname, buffer);
          const htmlname = uuid + ".html";
          const result = spawnSync(
            path.resolve(
              __dirname,
              "..",
              "catapult",
              "tracing",
              "bin",
              "trace2html"
            ),
            [jsonname, "--output=" + htmlname]
          );
          const stdout = result.stdout as any;
          if (stdout instanceof Buffer) {
            console.log("CATAPULT", stdout.toString("utf8"));
          } else if (typeof stdout === "string") {
            console.log("CATAPULT", stdout);
          }
          const status = result.status;
          console.log("CATAPULT status", result.status);

          if (status !== null) {
            if (status === 0) {
              return taskEither.right(htmlname);
            } else {
              return taskEither.left(
                new Error("CATAPULT failed with status " + status.toString())
              );
            }
          } else {
            return taskEither.left(
              new Error("CATAPULT failed with status null")
            );
          }
        }
      ),
      taskEither.mapLeft((e) => {
        if (e instanceof Error) {
          return e;
        } else {
          console.error(e);
          return new Error("failed to make tracing");
        }
      })
    );
  };
  return runWithBrowser(launchOption, browserReader);
}

// export function traceZrestLoading(liburl: URL, zrestURL: URL, bucket: string, key: string) {
//     console.log("Trace zrest start", liburl);
//     const browserReader = (browser: Browser) => {
//         return pipe(
//             pageTask,
//             taskEither.chainFirst(startTracing),
//             taskEither.chainFirstW(page => {
//                 const events = streamPageEvents(page, htmlurl)({
//                     filter: r => r.url().startsWith(hookDomain),
//                     alterResponse: () => none,
//                     debugResponse: () => {
//                     }
//                 }).pipe(stopWhenError, map(either.map(logEvent)))
//                 return toTaskEither(events);
//             }),
//             taskEither.chain(stopTracing),
//             taskEither.chainW((buffer): TaskEither<Error, string> => {
//                 const uuid = uuidv4().toString()
//                 const jsonname = uuid + ".json";
//                 fs.writeFileSync(jsonname, buffer);
//                 const htmlname = uuid + ".html";
//                 const result = spawnSync(path.resolve(__dirname, "..", "catapult", "tracing", "bin", "trace2html"), [jsonname, "--output=" + htmlname]);
//                 const stdout = result.stdout as any;
//                 if (stdout instanceof Buffer) {
//                     console.log("CATAPULT", stdout.toString("utf8"))
//                 } else if (typeof stdout === 'string') {
//                     console.log("CATAPULT", stdout);
//                 }
//                 const status = result.status;
//                 console.log("CATAPULT status", result.status);
//
//                 if (status !== null) {
//                     if (status === 0) {
//                         return taskEither.right(htmlname);
//                     } else {
//                         return taskEither.left(new Error("CATAPULT failed with status " + status.toString()))
//                     }
//                 } else {
//                     return taskEither.left(new Error("CATAPULT failed with status null"));
//                 }
//             }),
//             taskEither.chainW(htmlname => {
//                 const htmlbuffer = fs.readFileSync(htmlname);
//                 return uploadTask(htmlbuffer, bucket, key);
//             }),
//             taskEither.map(_ => {
//                 return keyToURL(key, bucket);
//             }),
//             taskEither.mapLeft(e => {
//                 if (e instanceof Error) {
//                     return e
//                 } else {
//                     console.error(e);
//                     return new Error("failed")
//                 }
//             }),
//         )
//     }
//     return runWithBrowser(launchOption, browserReader);
// }
