import {
    benchmarkBundleSize,
    benchmarkFPS,
    benchmarkSrestLoading,
    benchmarkZrestLoading,
    makeTraceZrestLoading,
} from "../src";
import {URL} from "url";
import {testDataProvision} from "./test-data-provision";
import {isRight} from "fp-ts/Either";
import {pipe} from "fp-ts/lib/function";
import {taskEither} from "fp-ts";

test("zrest loading test", () => {
    const sampleLib = "https://viewer-library.s3.ap-northeast-2.amazonaws.com/closet.viewer-render.js";
    return benchmarkZrestLoading(new URL(sampleLib), testDataProvision.zrestURLs, "test")().then(eth => {
        if (isRight(eth)) {
            console.log(eth.right);
            expect(true).toBeTruthy();
        } else {
            console.log(eth.left);
            expect(false).toBeTruthy();
        }
    })
}, 1000 * 60 * 3);

test("zrest loading anti test", () => {
    const badLibURL = "https://viewer-library.s3.ap-northeast-2.amazonaws.com/wrong.closet.viewer-render.js";
    return benchmarkZrestLoading(new URL(badLibURL), testDataProvision.zrestURLs, "test")()
        .then(eth => {
            if (isRight(eth)) {
                console.log(eth.right)
                expect(false).toBeTruthy();
            } else {
                console.log(eth.left)
                expect(true).toBeTruthy();
            }
        })
}, 1000 * 60 * 3);

test("test-fps", () => {
    const sampleLib = "https://viewer-library.s3.ap-northeast-2.amazonaws.com/closet.viewer-render.js";
    return benchmarkFPS(new URL(sampleLib), new URL(testDataProvision.heavy), 2000, 2000, 10000)().then(eth => {
        if (isRight(eth)) {
            console.log(eth.right);
            expect(true).toBeTruthy();
        } else {
            console.log(eth.left);
            expect(false).toBeTruthy();
        }
    })
}, 1000 * 60 * 3);

test("fps anti test", () => {
    const badlib = "https://viewer-library.s3.ap-northeast-2.amazonaws.com/badbadbad.viewer-render.js";
    return benchmarkFPS(new URL(badlib), new URL(testDataProvision.heavy), 2000, 2000, 10000)().then(eth => {
        if (isRight(eth)) {
            console.log(eth.right);
            expect(false).toBeTruthy();
        } else {
            console.log(eth.left);
            expect(true).toBeTruthy();
        }
    })
}, 1000 * 60 * 3);

test("bundlesize", () => {
    const sampleLib = "https://viewer-library.s3.ap-northeast-2.amazonaws.com/closet.viewer-render.js";
    return benchmarkBundleSize(new URL(sampleLib)).then(eth => {
        if (isRight(eth)) {
            console.log(eth.right);
            expect(true).toBeTruthy()
        } else {
            console.log(eth.left);
            expect(false).toBeTruthy()
        }
    }).catch()
})


test("srest loading test", () => {
    const aaa = new URL("https://viewer-library.s3.ap-northeast-2.amazonaws.com/closet.viewer-qkqk.js")
    const task = benchmarkSrestLoading(aaa, testDataProvision.srestJsonURLs);

    return task().then(eth => {
        if (isRight(eth)) {
            console.log(eth.right);
            expect(true).toBeTruthy();
        } else {
            console.log(eth.left);
            expect(false).toBeTruthy();
        }
    })
}, 1000 * 60 * 10)

test("srest loading anti test", () => {
    const badLibURL = "https://viewer-library.s3.ap-northeast-2.amazonaws.com/wrong.closet.viewer-render.js";

    const task = benchmarkSrestLoading(new URL(badLibURL), testDataProvision.srestJsonURLs);

    return task().then(eth => {
        if (isRight(eth)) {
            console.log(eth.right);
            expect(false).toBeTruthy();
        } else {
            console.log(eth.left);
            expect(true).toBeTruthy();
        }
    })
}, 1000 * 60 * 10)
test("aoeuaoeuaoeuaoeu", () => {
    // const task = makeTraceZrestLoading(testDataProvision.liburl, testDataProvision.zrestURLs[0]);
    const task = makeTraceZrestLoading({
        liburl: testDataProvision.liburl, zrestURL: testDataProvision.zrestURLs[0]
    });

    return pipe(
        task,
        taskEither.bimap(
            x => {
                console.error(x)
                expect(false).toBeTruthy();
            },
            putresult => {
                console.log(putresult);
                expect(true).toBeTruthy();
            }
        )
    )();
}, 1000 * 60);
// test("srest cache test", () => {
//     const srestsTask = fetchSrests_token(testDataProvision.domain, testDataProvision.styleIds)(testDataProvision.token);
//     const testtask = pipe(
//         srestsTask,
//         taskEither.chain(srests => {
//             return withCachedSrests(srests, cachedSrests => {
//                 cachedSrests.forEach(cache => {
//                     console.log(cache.rest);
//                     console.log(cache.dracos);
//                     console.log(cache.images);
//                 })
//                 return taskEither.of(true);
//             })
//         })
//     )
//
//     return testtask().then(either => {
//         if (isRight(either)) {
//             expect(true).toBeTruthy();
//         } else {
//             expect(false).toBeTruthy();
//         }
//     })
// }, 1000 * 60 * 5)
// test("get token", () => {
//     return getToken({domain:testDataProvision.domain, email:testDataProvision.email, password:testDataProvision.password})().then(x => {
//         console.log(x);
//         expect(true).toBeTruthy();
//     }).catch(()=>{
//         expect(false).toBeTruthy();
//     })
// })