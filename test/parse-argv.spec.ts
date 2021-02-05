import {URL} from "url";
import {
    comparisonZrestURLsLongName,
    fpsMSLongName,
    fpsViewHeightLongName,
    fpsViewWidthLongName,
    Info,
    parseArgvs,
    srestJsonURLsLongName, tracingBucketLongName, tracingZrestURLsLongName,
} from "../src/parse-argv";

test("test", () => {
    return expect(parseArgvs(["npx", "ts-node", "bad-script.ts"])).rejects.toThrow();
});

test("test2", () => {
    return expect(parseArgvs(["npx", "ts-node", "zrest-benchmarker.ts"])).rejects.toThrow();
});

test("test3", () => {
    return expect(parseArgvs(["npx", "ts-node", "zrest-benchmarker.ts", "-l", "aoeuaoeu"])).rejects.toThrow();
});

test("test4", () => {
    return expect(parseArgvs(["npx", "ts-node", "zrest-benchmarker.ts", "-l", "aoeuaoeu", "-z", "acoheucaoehu"])).rejects.toThrow();
});

test("test4", () => {
    return expect(parseArgvs(["npx", "ts-node", "zrest-benchmarker.ts", "-l", "aoeuaoeu", "-z", "acoheucaoehu", "-a", "ohecuhoecue"])).rejects.toThrow();
});

test("test4", () => {
    return expect(
        parseArgvs([
            "npx",
            "ts-node",
            "zrest-benchmarker.ts",
            "-l",
            "https://google.com",
            "-z",
            "https://youtube.com",
            "-a",
            "https://github.com",
            "-t",
            "TableName",
            "--heavy-zrest",
            "https://ingun37.github.com",
            fpsViewHeightLongName, "512",
            fpsViewWidthLongName, "111",
            fpsMSLongName, '5000',
            srestJsonURLsLongName, 'srestid1',
            srestJsonURLsLongName, 'srestid2',
            tracingZrestURLsLongName, "tztz",
            tracingBucketLongName, "tbucket",
            comparisonZrestURLsLongName, "https://aoeu.com"
        ])
    ).resolves.toEqual(
        new Info(
            new URL("https://google.com"),
            [new URL("https://youtube.com")],
            new URL("https://ingun37.github.com"),
            new URL("https://github.com"),
            "TableName",
            {},
            111, 512, 5000,
            ['srestid1', 'srestid2'],
            ["tztz"],
            "tbucket",
            [new URL("https://aoeu.com")]
        ));
});

test("test4", () => {
    return expect(
        parseArgvs([
            "npx",
            "ts-node",
            "zrest-benchmarker.ts",
            "-l",
            "https://google.com",
            "-z",
            "https://youtube.com",
            "-a",
            "https://github.com",
            "--heavy-zrest",
            "https://ingun37.github.com/",
            "-t",
            "TableName",
            fpsViewWidthLongName, '512',
            fpsViewHeightLongName, '555',
            fpsMSLongName, '5000',
            srestJsonURLsLongName, 'srestid1',
            srestJsonURLsLongName, 'srestid2',
            tracingZrestURLsLongName, "tztz",
            tracingBucketLongName, "tbucket",
            comparisonZrestURLsLongName, "https://aoeu.com",
            "AuthorDate",
            "aoeuaoeu",
            "CommitId",
            "ccc",
        ])
    ).resolves.toEqual(
        new Info(
            new URL("https://google.com"),
            [new URL("https://youtube.com")],
            new URL("https://ingun37.github.com/"),
            new URL("https://github.com"),
            "TableName", {
                AuthorDate: "aoeuaoeu",
                CommitId: "ccc",
            }, 512, 555, 5000, ['srestid1', 'srestid2'],
            ["tztz"],
            "tbucket",
            [new URL("https://aoeu.com")]
            )
    );
});
