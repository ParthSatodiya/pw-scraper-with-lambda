import { BrowserContext, chromium } from 'playwright-chromium';
import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { URLSearchParams } from 'url';

interface RequestBody {
    searchStr: string
}

interface searchResult {
    headline?: string,
    url?: null|string,
    siteName?: string
}

interface ResponseBody {
    google?: Array<searchResult>,
    brave?: Array<searchResult>,
    bing?: Array<searchResult>,
    error?: string
}

export const handler: Handler = async (event?: APIGatewayProxyEvent, context?: any): Promise<APIGatewayProxyResult> => {
    console.log("EVENT: \n" + JSON.stringify(event, null, 2));
    // console.log("CONTEXT: \n" + JSON.stringify(context, null, 2));

    let requestBody: undefined|RequestBody;

    if (!event || event.body == undefined) {
        requestBody = {searchStr: "Hello world"}
    } else if (event?.body) {
        requestBody = JSON.parse(event?.body);
    }
    
    if (!requestBody || !requestBody?.searchStr) {
        throw new Error("Search string is empty!")
    }
    console.log("Request body: ", requestBody);

    let response: APIGatewayProxyResult = {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        isBase64Encoded: false,
        body: ""
    }
    let responseBody: ResponseBody;

    try {
        responseBody = await main(requestBody.searchStr);
        console.log("Completed!");
    } catch (e: any) {
        console.log(e);
        responseBody = {
            "error": "Failed to scrape!"
        }
        response["statusCode"] = 500;
    }

    response["body"] = JSON.stringify(responseBody);
    return response;
};

export async function main(searchStr: string) {
    console.log("Launching browser");
    const browser = await chromium.launch({
        headless: true,
        args: [
            "--single-process",
            "--disable-gpu",
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-sandbox',
            '--no-zygote',
            '--deterministic-fetch',
            '--disable-features=IsolateOrigins',
            '--disable-site-isolation-trials',
        ]
    });
    const context = await browser.newContext();

    let results: ResponseBody = {};
    try {
        //// "--single-process" chromium option is require in order to run playwright scraper on lambda 
        //// Parallel tabs does not work with this option. So can't do the searching simultaneously

        // const multipleResults = await Promise.all([
        //     googleSearch(context, searchStr),
        //     braveSearch(context, searchStr)
        // ])
        // results["google"] = multipleResults[0];
        // results["brave"] = multipleResults[1];

        results["google"] = await googleSearch(context, searchStr);
        results["brave"] = await braveSearch(context, searchStr);
        
    } catch (e: any) {
        console.log("Error searching results.", e);
        await browser.close();
        throw e
    }

    await browser.close();
    console.log(JSON.stringify(results))
    return results;
}

const googleSearch = async (context: BrowserContext, searchStr: string): Promise<Array<searchResult>> => {

    const page = await context.newPage();
    const result: Array<searchResult> = [];
    const queryParam = new URLSearchParams({q: searchStr}).toString();
    console.log(`Searching on google at https://google.com/search?${queryParam}`)
    await page.goto(`https://google.com/search?${queryParam}`);

    const headlines = page.locator("a", { has: page.locator("h3").locator('visible=true')});
    await headlines.first().waitFor({state: "visible", timeout: 10000})
    const count = await headlines.count();
    for (let i=0; i<count; i++) {
        let headline, url, siteName;
        try {
            headline = await headlines.nth(i).locator("h3").innerText({timeout: 1000});
            url = await headlines.nth(i).getAttribute("href", {timeout: 1000});
            siteName = await headlines.nth(i).locator("div > div > span").innerText({timeout: 1000});
        } catch (e) {
            continue;
        }
        result.push({headline, url, siteName});
    }
    console.log("Google complete");

    await page.close();
    return result
}

const braveSearch = async (context: BrowserContext, searchStr: string): Promise<Array<searchResult>> => {

    const page = await context.newPage();
    const result: Array<searchResult> = [];
    const queryParam = new URLSearchParams({q: searchStr}).toString();
    console.log(`Searching on brave at https://search.brave.com/search?${queryParam}`)
    await page.goto(`https://search.brave.com/search?${queryParam}`);

    const headlines = page.locator("div.snippet.fdb");
    const count = await headlines.count();
    for (let i=0; i<count; i++) {
        let headline, url, siteName;
        try {
            headline = await headlines.nth(i).locator("a > span").innerText({timeout: 1000});
            url = await headlines.nth(i).locator("> a").getAttribute("href", {timeout: 1000});
            siteName = await headlines.nth(i).locator("a > cite > span.netloc").innerText({timeout: 1000});
        } catch (e) {
            console.log(e);
            continue;
        }
        result.push({headline, url, siteName});
    }
    console.log("Brave complete");

    await page.close();
    return result
}

const bingSearch = async (context: BrowserContext, searchStr: string): Promise<Array<searchResult>> => {

    const page = await context.newPage();
    const result: Array<searchResult> = [];
    const queryParam = new URLSearchParams({q: searchStr}).toString();
    console.log(`Searching on bing at https://www.bing.com/search?${queryParam}`)
    await page.goto(`https://www.bing.com/`);
    await page.locator("#sb_form_q").click();
    await page.locator("#sb_form_q").fill(searchStr)
    await page.locator("#search_icon").click();

    const headlines = page.locator(".b_algo");
    await headlines.first().waitFor({state: "visible", timeout: 10000})
    const count = await headlines.count();
    for (let i=0; i<count; i++) {
        let headline, url, siteName;
        try {
            headline = await headlines.nth(i).locator("h2").first().innerText();
            url = await headlines.nth(i).locator("h2 > a").getAttribute("href");
            siteName = await headlines.nth(i).locator(".tptt").innerText();
        } catch (e) {
            continue;
        }
        result.push({headline, url, siteName});
    }
    console.log("Bing complete");

    await page.close();
    return result
}

