import puppeteer, { Browser, Page, Cookie } from "puppeteer";
import fs from "fs";
import consola from "consola";
interface PostRaw {
	author: string;
	time: string;
	content: string;
	data: string;
}
export default class ParseClass {
	private browser: Browser;
	private page: Page | undefined;
	private cookies: Cookie[] | undefined;
	private cookiePath: string;
	private searchQuery: string;
	private parseOneTimeLimit: number;

	constructor(
		browser: Browser,
		cookiePath: string,
		searchQuery: string,
		parseOneTimeLimit: number
	) {
		this.cookiePath = cookiePath;
		this.page = undefined;
		this.browser = browser;
		this.searchQuery = searchQuery;
		this.parseOneTimeLimit = parseOneTimeLimit;

		//Check if cookies file exist.
		if (!fs.existsSync(cookiePath)) return;
		this.cookies = JSON.parse(fs.readFileSync(cookiePath, "utf-8")) as Cookie[];
		if (this.cookies === undefined) return;
		for (const cookie of this.cookies) {
			this.browser.setCookie(cookie);
		}
	}
	public static async initialize(
		cookiePath: string,
		searchQuery: string,
		parseOneTimeLimit: number
	): Promise<ParseClass> {
		return new ParseClass(
			await puppeteer.launch({
				headless: false,
			}),
			cookiePath,
			searchQuery,
			parseOneTimeLimit
		);
	}
	public async exit() {
		await this.browser.close();
		return;
	}
	public async login(): Promise<ParseClass> {
		this.page = await this.browser.newPage();
		await this.page.authenticate({
			username: process.env.PROXY_USERNAME as string,
			password: process.env.PROXY_PASSWORD as string,
		});
		consola.success("Authenticated Proxy");
		await this.page.goto("https://x.com/login");
		await this.page.waitForFunction(
			() => window.location.href === "https://x.com/home"
		);
		consola.success("Logged in");

		//Just in case, write cookies so we dont need to login multiple times
		const cookies = await this.browser.cookies();
		fs.writeFileSync(this.cookiePath, JSON.stringify(cookies));

		return this;
	}
	public async search(): Promise<ParseClass> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		await this.page.goto(this.searchQuery, {
			waitUntil: "networkidle2",
		});
		await this.page.waitForSelector('[aria-label="Timeline: Cari timeline"]', {
			timeout: 10000,
		});
		await new Promise((res) => {
			consola.warn("Waiting for full load");
			setTimeout(res, 5000);
		});
		consola.success("Loaded timeline");
		return this;
	}
	public async parse(): Promise<PostRaw[]> {
		if (this.page === undefined) throw new Error("Page not ready");
		const data: PostRaw[] = (await this.page.evaluate(
			(oneTimeEvaluateLimit: number) => {
				return new Promise(async (resolve) => {
					let stop: boolean = false;
					const newData: PostRaw[] = [];
					const observer = new MutationObserver((mutations) => {
						mutations.forEach((mutation) => {
							mutation.addedNodes.forEach((node) => {
								if (node.nodeType !== Node.ELEMENT_NODE) return;
								const elementNode = node as HTMLElement;
								const insideContent = elementNode.querySelector(
									"div > div > article > div div:nth-of-type(2) > div:nth-of-type(2)"
								);
								if (!insideContent) return;
								const author = insideContent.querySelector(
									"div:nth-of-type(1) > div > div:nth-of-type(1) > div > div > div:nth-of-type(2) > div > div:nth-of-type(1) > a > div > span"
								)?.textContent;
								if (author === null || author === undefined) return;
								const time =
									insideContent
										.querySelector(
											"div:nth-of-type(1) > div > div:nth-of-type(1) > div > div > div:nth-of-type(2) > div > div:nth-of-type(3) > a > time"
										)
										?.getAttribute("datetime") || "DATEUNDEFINED";
								const contentSpans =
									insideContent.children[1].querySelector("div")?.children;
								if (contentSpans === undefined || contentSpans.length === 0)
									return;
								let content = "";
								for (const span of contentSpans) {
									content += span.textContent;
								}
								if (
									content === undefined ||
									content === null ||
									content.length === 0
								)
									return;
								const postDataDiv =
									insideContent.children[insideContent.children.length - 1]
										.querySelector("div:nth-of-type(1) > div")
										?.getAttribute("aria-label") || "";
								newData.push({
									author: author,
									time: time,
									content: content,
									data: postDataDiv,
								});
							});
						});
						if (newData.length >= oneTimeEvaluateLimit) {
							stop = true;
							observer.disconnect();
							resolve(newData);
							return;
						}
					});
					const container = document.querySelector(
						'[aria-label="Timeline: Cari timeline"] > div'
					);
					if (container === null) throw new Error("Element couldn't be found");
					observer.observe(container, {
						childList: true,
					});
					while (!stop) {
						window.scrollBy(0, 100);
						await new Promise((res) => setTimeout(res, 200));
					}
				});
			},
			this.parseOneTimeLimit
		)) as PostRaw[];

		return data;
	}
}
