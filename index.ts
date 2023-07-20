import { Browser, chromium } from 'playwright-chromium';
import { Handler, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { URLSearchParams } from 'url';

interface RequestBody {
    searchStr: string
}

interface ResponseBody {
    google?: Array<string>,
    bing?: Array<string>,
    error?: string
}

export const handler: Handler = async (event?: APIGatewayProxyEventV2, context?: any): Promise<APIGatewayProxyResultV2> => {
    // console.log("EVENT: \n" + JSON.stringify(event, null, 2));
    // console.log("CONTEXT: \n" + JSON.stringify(context, null, 2));

    let requestBody: undefined|RequestBody;

    if (event?.body) {
        requestBody = JSON.parse(event?.body);
    }
    
    if (!requestBody || !requestBody?.searchStr) {
        throw new Error("Search string is empty!")
    }
    console.log("Request body: ", requestBody);

    let response: APIGatewayProxyResultV2 = {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        isBase64Encoded: false,
    }
    let responseBody: ResponseBody;

    try {
        responseBody = await main(requestBody.searchStr);
        console.log("Completed!");
    } catch (e: any) {
        responseBody = {
            "error": "Failed to scrape!"
        }
        response["statusCode"] = 500;
    }

    response["body"] = JSON.stringify(responseBody);
    if (event === undefined) {
        console.log(response);
    }
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

    let result: ResponseBody = {};
    try {
        result["google"] = await googleSearch(browser, searchStr);
    } catch (e: any) {
        console.log("Error searching results.", e);
        await browser.close();
        throw e
    }

    await browser.close();
    return result;
}

const googleSearch = async (browser: Browser, searchStr: string): Promise<Array<string>> => {

    const page = await browser.newPage();
    const result: Array<string> = [];
    const queryParam = new URLSearchParams({q: searchStr}).toString();
    console.log({queryParam});
    await page.goto(`https://google.com/search?${queryParam}`);

    const mainHeadings = page.locator("h3").locator('visible=true');
    const count = await mainHeadings.count();
    for (let i=0; i<count; i++) {
        const headingStr = await mainHeadings.nth(i).innerText();
        console.log(headingStr);
        result.push(headingStr);
    }

    await page.close();
    return result
}

