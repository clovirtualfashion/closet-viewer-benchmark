#!/usr/bin/env node

import {
    benchmarkBundleSize,
    benchmarkFPS,
    benchmarkSrestLoading,
    benchmarkZrestLoading,
    Result,
    traceZrestLoading
} from ".";
import * as E from "fp-ts/Either";
import {Either} from "fp-ts/Either";
import fetch from "node-fetch";
import {parseArgvs} from "./parse-argv";
import {DynamoM, encodeDynamoFormat} from "./encode-dynamo";
import * as _ from "lodash";
import {pipe} from "fp-ts/function";
import {either, readonlyArray, taskEither} from "fp-ts";
import * as uuid from "uuid";
import {from} from "rxjs";
import {concatMap, reduce} from "rxjs/operators";
import {URL} from "url";
import {sequenceT} from "fp-ts/Apply";


const argTask = parseArgvs(process.argv);

argTask
    .then(async (info) => {

        const benchmarkingTasks: Either<unknown, Result>[] = [
            await benchmarkBundleSize(info.libraryURL),
            await benchmarkZrestLoading(info.libraryURL, info.zrestURLs, "zrest loading benchmarking")(),
            await benchmarkFPS(info.libraryURL, info.heavyZrestURL, info.fpsViewWidth, info.fpsViewHeight, info.fpsMS)(),
            await benchmarkSrestLoading(info.libraryURL, info.srestJsonURLs)(),
            await benchmarkZrestLoading(info.libraryURL, info.comparisonZrestURLs, "zrest set 2 loading")(),
            // await retryN(8, ()=>benchmarkSrestLoading(info.libraryURL, info.srestJsonURLs))()
        ];
        const benchmarkingResults = pipe(
            either.sequenceArray(benchmarkingTasks),
            either.map(readonlyArray.reduceRight({}, (result, agg: Result) => {
                return _.assign(result, agg);
            })),
        );
        const tracingResults = await from(info.tracingZrestURLs).pipe(
            concatMap(url => {
                return pipe(
                    traceZrestLoading(info.libraryURL, new URL(url), info.tracingBucket, uuid.v4().toString() + ".html"),
                    taskEither.map((htmlurl): [string, string] => [url, htmlurl])
                )()
            }),
            reduce((acc, eth, index) => {
                return pipe(
                    sequenceT(either.either)(acc, eth),
                    either.map(([obj, [x, y]]) => {
                        obj[x] = y;
                        return obj;
                    })
                )
            }, either.right<Error, Record<string, string>>({}))
        ).toPromise()

        const encoded = pipe(
            sequenceT(either.either)(benchmarkingResults, tracingResults),
            either.map(([aggregatedBenchmark, aggregatedTracing]) => ({
                id: uuid.v4(),
                report: {
                    benchmarks: aggregatedBenchmark,
                    tracings: aggregatedTracing,
                    meta: info.meta,
                }
            })),
            either.chainW(encodeDynamoFormat),
            either.map(xx => {
                return (xx as DynamoM).M
            })
        )

        return pipe(
            encoded,
            E.fold(
                x => Promise.reject(x),
                body => {
                    const jsonStr = JSON.stringify({
                        TableName: info.tableName,
                        Item: body,
                    })
                    console.log("putting", jsonStr);
                    return fetch(info.apiURL, {
                        method: "post",
                        body: jsonStr,
                        headers: {"Content-Type": "application/json"},
                    })
                }
            )
        )
    })
    .catch((err) => {
        console.log("caugut a error");
        console.error(err);
    });
