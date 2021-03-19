#!/usr/bin/env node

import {
  benchmarkBundleSize,
  benchmarkFPS,
  benchmarkSrestLoading,
  benchmarkSrestLoadingWithSrests,
  benchmarkZrestLoading,
  makeTraceZrestLoading,
  Result,
} from ".";
import * as E from "fp-ts/Either";
import { Either, isLeft } from "fp-ts/Either";
import fetch from "node-fetch";
import { parseArgvs } from "./parse-argv";
import { DynamoM, encodeDynamoFormat } from "./encode-dynamo";
import * as _ from "lodash";
import { identity, pipe } from "fp-ts/function";
import { either, readonlyArray, record, taskEither } from "fp-ts";
import * as uuid from "uuid";
import { from } from "rxjs";
import { concatMap, reduce } from "rxjs/operators";
import { URL } from "url";
import { sequenceT } from "fp-ts/Apply";
import fs from "fs";
import { tryCatchK } from "fp-ts/TaskEither";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { secretTestDataTask } from "./secrets";
import { noti } from "./slack";

const argTask = parseArgvs(process.argv);
const s3 = new S3Client({ region: "ap-northeast-2" });

argTask
  .then(async (info) => {
    noti("Benchmarking STARTED");
    const secretTestdata = await secretTestDataTask();
    if (isLeft(secretTestdata)) {
      throw secretTestdata.left;
    }
    const secretZrests = pipe(
      secretTestdata.right.zrests,
      record.collect((_, v) => new URL(v))
    );
    const secretSrests = pipe(
      secretTestdata.right.srests,
      record.collect((_, v) => v)
    );
    const benchmarkingTasks: Either<unknown, Result>[] = [
      await benchmarkBundleSize(info.libraryURL),
      await benchmarkZrestLoading(
        info.libraryURL,
        info.zrestURLs,
        "zrest loading benchmarking"
      )(),
      await benchmarkFPS(
        info.libraryURL,
        info.heavyZrestURL,
        info.fpsViewWidth,
        info.fpsViewHeight,
        info.fpsMS
      )(),
      await benchmarkSrestLoading(
        info.libraryURL,
        info.srestJsonURLs,
        "srest loading benchmarking"
      )(),
      await benchmarkZrestLoading(
        info.libraryURL,
        info.comparisonZrestURLs,
        "zrest set 2 loading"
      )(),
      await benchmarkZrestLoading(
        info.libraryURL,
        secretZrests,
        "special zrest loading"
      )(),
      await benchmarkSrestLoadingWithSrests(
        info.libraryURL,
        secretSrests,
        "special srest loading"
      )(),
      // await retryN(8, ()=>benchmarkSrestLoading(info.libraryURL, info.srestJsonURLs))()
    ];
    const benchmarkingResults = pipe(
      either.sequenceArray(benchmarkingTasks),
      either.map(
        readonlyArray.reduceRight({}, (result, agg: Result) => {
          return _.assign(result, agg);
        })
      )
    );
    const tracingResults = await from(info.tracingZrestURLs)
      .pipe(
        concatMap((url) => {
          const bucket = info.tracingBucket;
          const key = uuid.v4().toString() + ".html";
          return pipe(
            makeTraceZrestLoading({
              liburl: info.libraryURL,
              zrestURL: new URL(url),
            }),
            taskEither.chainW((htmlname) => {
              const htmlbuffer = fs.readFileSync(htmlname);
              return uploadTask(htmlbuffer, bucket, key);
            }),
            taskEither.map((_) => {
              return keyToURL(key, bucket);
            }),
            taskEither.map((htmlurl): [string, string] => [url, htmlurl])
          )();
        }),
        reduce((acc, eth) => {
          return pipe(
            sequenceT(either.either)(acc, eth),
            either.map(([obj, [x, y]]) => {
              obj[x] = y;
              return obj;
            })
          );
        }, either.right<unknown, Record<string, string>>({}))
      )
      .toPromise();

    const encoded = pipe(
      sequenceT(either.either)(benchmarkingResults, tracingResults),
      either.map(([aggregatedBenchmark, aggregatedTracing]) => ({
        id: uuid.v4(),
        report: {
          benchmarks: aggregatedBenchmark,
          tracings: aggregatedTracing,
          meta: info.meta,
        },
      })),
      either.chainW(encodeDynamoFormat),
      either.map((xx) => {
        return (xx as DynamoM).M;
      })
    );

    return pipe(
      encoded,
      E.fold(
        (x) => Promise.reject(x),
        (body) => {
          const jsonStr = JSON.stringify({
            TableName: info.tableName,
            Item: body,
          });
          console.log("putting", jsonStr);
          return fetch(info.apiURL, {
            method: "post",
            body: jsonStr,
            headers: { "Content-Type": "application/json" },
          });
        }
      )
    );
  })
  .then(() => {
    noti(
      "Benchmarking SUCCEEDED 🎉. Go check https://main.d25rzop7f0k2kq.amplifyapp.com"
    );
  })
  .catch((err) => {
    console.log("caugut a error");
    console.error(err);
    noti("Benchmarking Failed ❌: " + JSON.stringify(err));
  });

function keyToURL(key: string, bucket: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  const safebucket = encodeURIComponent(bucket);
  return `https://${safebucket}.s3.ap-northeast-2.amazonaws.com/${path}`;
}

const uploadTask = tryCatchK((buffer: Buffer, bucket: string, key: string) => {
  return s3.send(
    new PutObjectCommand({
      Body: buffer,
      ContentLength: buffer.length,
      Bucket: bucket,
      GrantRead: 'uri="http://acs.amazonaws.com/groups/global/AllUsers"',
      ContentType: "text/html",
      Key: key,
    })
  );
}, identity);
