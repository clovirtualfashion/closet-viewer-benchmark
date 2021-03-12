import {DynamicCommandLineParser} from "@rushstack/ts-command-line";
import {pipe} from "fp-ts/lib/pipeable";
import {URL} from "url";
import * as D from "io-ts/Decoder";
import * as O from "fp-ts/Option";
import * as path from "path";
import {identity} from "fp-ts/lib/function";
import * as _ from "lodash";

function checker(x: any): boolean {
    return pipe(
        x,
        D.string.decode,
        O.fromEither,
        O.map(path.basename),
        O.map((base) => base === "zrest-benchmarker.js" || base === "zrest-benchmarker" || base === "zrest-benchmarker.ts"),
        O.fold(() => false, identity)
    );
}

export class ArgvExhausted extends Error {
}

export class ArgvParseError extends Error {
}

const libraryURLLongName = "--library-url";
const zrestsLongName = "--zrest-url";
const apiURLLongName = "--api-url";
const tableNameLongName = "--table-name"
const heavyZrestLongName = "--heavy-zrest"
export const fpsViewWidthLongName = "--fps-view-width"
export const fpsViewHeightLongName = "--fps-view-height"
export const fpsMSLongName = "--fps-ms";
export const srestJsonURLsLongName = "--srest-json-url";
export const tracingZrestURLsLongName = "--tracing-zrest"
export const tracingBucketLongName = "--tracing-bucket"
export const comparisonZrestURLsLongName="--compare-zrest-url"
export class Info {
    constructor(
        public libraryURL: URL,
        public zrestURLs: URL[],
        public heavyZrestURL: URL,
        public apiURL: URL,
        public tableName: string,
        public meta: { [property: string]: string },
        public fpsViewWidth: number,
        public fpsViewHeight: number,
        public fpsMS: number,
        public readonly srestJsonURLs: readonly string[],
        public readonly tracingZrestURLs: readonly string[],
        public readonly tracingBucket: string,
        public readonly comparisonZrestURLs: URL[],
    ) {
    }
}

function _parseArgvs(commandLineParser: DynamicCommandLineParser, argv: string[]): Promise<Info> {
    if (argv.length === 0) {
        return Promise.reject(new ArgvExhausted());
    }
    const head = argv.shift();
    console.log("Entrypoint check: ", head);
    if (checker(head)) {
        return commandLineParser.executeWithoutErrorHandling(argv).then(() => {
            const libURL = commandLineParser.getStringParameter(libraryURLLongName).value!;
            const zrestURLs = commandLineParser.getStringListParameter(zrestsLongName).values;
            const apiURL = commandLineParser.getStringParameter(apiURLLongName).value!;
            const flatMeta = commandLineParser.remainder?.values ?? [];
            const tableName = commandLineParser.getStringParameter(tableNameLongName).value!;
            const heavyZrestURL = commandLineParser.getStringParameter(heavyZrestLongName).value!;
            const meta = _.fromPairs(_.chunk(flatMeta, 2));
            const fpsViewW = commandLineParser.getIntegerParameter(fpsViewWidthLongName).value!;
            const fpsViewH = commandLineParser.getIntegerParameter(fpsViewHeightLongName).value!;
            const fpsMS = commandLineParser.getIntegerParameter(fpsMSLongName).value!;
            const tracingZrestURLs = commandLineParser.getStringListParameter(tracingZrestURLsLongName).values;
            const tracingBucket = commandLineParser.getStringParameter(tracingBucketLongName).value!;
            const comparisonZrests = commandLineParser.getStringListParameter(comparisonZrestURLsLongName).values;
            try {
                return new Info(
                    new URL(libURL),
                    zrestURLs.map((x) => new URL(x)),
                    new URL(heavyZrestURL),
                    new URL(apiURL),
                    tableName,
                    meta,
                    fpsViewW, fpsViewH, fpsMS,
                    commandLineParser.getStringListParameter(srestJsonURLsLongName).values,
                    tracingZrestURLs,
                    tracingBucket,
                    comparisonZrests.map((x) => new URL(x)),
                );
                // return [new URL(libURL), zrestURLs.map((x) => new URL(x))];
            } catch (e) {
                return Promise.reject(e);
            }
        });
    } else {
        return _parseArgvs(commandLineParser, argv);
    }
}


export function parseArgvs(argv: string[]): Promise<Info> {
    const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
        toolFilename: "zrest-benchmarker",
        toolDescription: "Performs benchmarking for given zrests and outputs the metrics as benchmarking-result.json",
    });

    commandLineParser.defineStringParameter({
        argumentName: "LIBRARYURL",
        parameterLongName: libraryURLLongName,
        parameterShortName: "-l",
        description: "URL to library. Can be file url.",
        required: true,
    });

    commandLineParser.defineStringListParameter({
        argumentName: "ZRESTURLS",
        parameterLongName: zrestsLongName,
        parameterShortName: "-z",
        description: "URL to a zrest. Can provide multiple.",
        required: true,
    });


    commandLineParser.defineStringParameter({
        argumentName: "APIURL",
        parameterLongName: apiURLLongName,
        parameterShortName: "-a",
        description: "URL to post json.",
        required: true,
    });

    commandLineParser.defineStringParameter({
        argumentName: "TABLENAME",
        parameterLongName: tableNameLongName,
        parameterShortName: "-t",
        description: "DynamoDB table name.",
        required: true,
    });

    commandLineParser.defineStringParameter({
        argumentName: "HEAVYZRESTURL",
        parameterLongName: heavyZrestLongName,
        description: "URL to heavy zrest for fps benchmarking.",
        required: true,
    });
    commandLineParser.defineIntegerParameter({
        argumentName: "FPSVIEWWIDTH",
        parameterLongName: fpsViewWidthLongName,
        description: "Width of the frame buffer to which benchmarker renders during fps-benchmarking.",
        required: true,
    });
    commandLineParser.defineIntegerParameter({
        argumentName: "FPSVIEWHEIGHT",
        parameterLongName: fpsViewHeightLongName,
        description: "Height of the frame buffer to which benchmarker renders during fps-benchmarking.",
        required: true,
    });
    commandLineParser.defineIntegerParameter({
        argumentName: 'FPSMILLISECONDS',
        parameterLongName: fpsMSLongName,
        description: "Determine for how long you will run fps benchmarking (milliseconds)",
        required: true
    })
    commandLineParser.defineStringListParameter({
        argumentName: "SREST_JSON_URLS",
        description: "srest json urls",
        parameterLongName: srestJsonURLsLongName,
        parameterShortName: "-s"
    })
    commandLineParser.defineStringListParameter({
        argumentName: "TRACING_ZREST_URLS",
        description: "tracing zrest urls",
        parameterLongName: tracingZrestURLsLongName,
    })
    commandLineParser.defineStringParameter({
        argumentName: "TRACING_BUCKET",
        description: "tracing bucket name",
        parameterLongName: tracingBucketLongName,
    })
    commandLineParser.defineStringListParameter({
        argumentName: "COMPARISON_ZREST_URLS",
        description: "zrests to compare with srest",
        parameterLongName: comparisonZrestURLsLongName,
    })
    // Remainder Must be defined last
    commandLineParser.defineCommandLineRemainder({
        description: "Define meta here. e.g, AuthorDate 1993-10-08 CommitId 1234567"
    })


    return _parseArgvs(commandLineParser, argv);
}
