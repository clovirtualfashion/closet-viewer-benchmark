import * as URL from "url";

export type TestDataProvision = {
    liburl:URL.URL;
    zrestURLs: URL.URL[];
    srestJsonURLs: string[];
    heavy:string
}