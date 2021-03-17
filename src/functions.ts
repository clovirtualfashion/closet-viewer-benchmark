import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import U, { pathToFileURL, URL } from "url";
import { pipe } from "fp-ts/function";
import {
  array,
  either,
  option,
  reader,
  readerEither,
  readerTaskEither,
  readonlyArray,
  record,
  taskEither,
} from "fp-ts";
import fs from "fs";
import { SRest } from "./types";
import P from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { bracket, TaskEither, tryCatchK } from "fp-ts/TaskEither";
import { ReaderEither } from "fp-ts/ReaderEither";
import { Either, isLeft, left, right } from "fp-ts/Either";
import got from "got";
import { from, Observable } from "rxjs";
import { map, toArray } from "rxjs/operators";
import { observable } from "fp-ts-rxjs";
import {
  fromTaskEither,
  ObservableEither,
  toTaskEither,
} from "fp-ts-rxjs/ObservableEither";
import {
  capDelay,
  exponentialBackoff,
  limitRetries,
  monoidRetryPolicy,
  RetryStatus,
} from "retry-ts";
import { log } from "fp-ts/Console";
import { retrying } from "retry-ts/lib/Task";
import { PPEvent } from "page-request-emitter";

const gotPromise = (url: string) =>
  got(url).then((response) => response.rawBody);

const downloadBuffer = tryCatchK(gotPromise, (err) => {
  if (err instanceof Error) {
    return err;
  } else {
    console.log(err);
    return new Error("download fail");
  }
});

function genTmpPathForCache(
  urlstr: string
): ReaderEither<string, Error, string> {
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
  };
}

function cacheFile_downloadDir(
  urlstr: string
): ReaderTaskEither<string, Error, URL> {
  console.log("caching", urlstr);
  return pipe(
    genTmpPathForCache(urlstr),
    readerEither.map((newPath) => {
      console.log("caching location:", newPath);
      return pipe(
        downloadBuffer(urlstr),
        taskEither.map((buffer) => {
          fs.writeFileSync(newPath, buffer);
          return pathToFileURL(newPath);
        })
      );
    }),
    reader.map(either.sequence(taskEither.taskEither)),
    readerTaskEither.chainEitherK((xxx) => xxx)
  );
}

function cacheSrest(srest: SRest) {
  const cache = (x: string[]) =>
    pipe(
      x,
      array.map(cacheFile_downloadDir),
      readerTaskEither.sequenceArray,
      readerTaskEither.map((urls) => urls.map((url) => url.toString()))
    );

  return pipe(
    srest,
    record.map(cache),
    record.sequence(readerTaskEither.readerTaskEither),
    readerTaskEither.map((r) => r as SRest)
  );
}

export function withCachedSrests<_V>(
  srests: readonly SRest[],
  task: ReaderTaskEither<readonly SRest[], Error, _V>
) {
  const tmpDir = P.resolve(os.tmpdir(), `srests-${uuidv4()}`);
  console.log("Creating new srests cache location", tmpDir);
  fs.mkdirSync(tmpDir, { recursive: true });

  const cacheTask = pipe(
    srests,
    readonlyArray.map(cacheSrest),
    readonlyArray.sequence(readerTaskEither.readerTaskEither)
  )(tmpDir);
  const mainTask = pipe(task);
  return bracket(cacheTask, mainTask, () => {
    console.log("Releasing cached srests", tmpDir);
    return taskEither.of(fs.rmdirSync(tmpDir, { recursive: true }));
  });
}

export function withDownloadedZrests<_A>(
  zresturls: U.URL[],
  task: ReaderTaskEither<readonly U.URL[], Error, _A>
) {
  const zrestsDir = P.resolve(os.tmpdir(), `zrests-${uuidv4()}`);
  fs.mkdirSync(zrestsDir, { recursive: true });
  console.log("tmp directory is made: " + zrestsDir);

  const downloadObservable = from(zresturls).pipe(
    map((url) => cacheFile_downloadDir(url.toString())(zrestsDir)),
    observable.chain(fromTaskEither),
    toArray(),
    map(either.sequenceArray)
  );
  const downloadTask = toTaskEither(downloadObservable);
  const releaseTask = () => {
    console.log("removing temporary directory ", zrestsDir, " ...");
    return taskEither.of<Error, void>(
      fs.rmdirSync(zrestsDir, { recursive: true })
    );
  };
  return bracket(downloadTask, task, releaseTask);
}

export function retryN<E, A>(count: number, taskMaker: () => TaskEither<E, A>) {
  const logDelay = (status: RetryStatus) =>
    taskEither.rightIO(
      log(
        pipe(
          status.previousDelay,
          option.map((delay) => `retrying in ${delay} milliseconds...`),
          option.getOrElse(() => "first attempt...")
        )
      )
    );

  return retrying(
    capDelay(
      1000 * 60 * 3,
      monoidRetryPolicy.concat(exponentialBackoff(30000), limitRetries(count))
    ),
    (status) => pipe(logDelay(status), taskEither.apSecond(taskMaker())),
    either.isLeft
  );
}

export function stopWhenError<_A>(
  oe: ObservableEither<Error, _A>
): ObservableEither<Error, _A> {
  return new Observable<Either<Error, _A>>((subscriber) => {
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
      },
    });
  });
}

export function logEvent(e: PPEvent) {
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
