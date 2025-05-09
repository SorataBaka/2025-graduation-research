import puppeteer, { Browser, Page, Cookie } from "puppeteer";
import fs from "fs";
import path, { parse } from "path";
import consola from "consola";
export interface PostRaw {
	author: string;
	time: string;
	content: string;
	data: string;
}
export interface TwitterParserClassOptions {
	proxy_username?: string;
	proxy_password?: string;
	headless?: boolean;
	cookie_path?: string;
	parse_limit?: number;
	scroll_delay?: number;
	scroll_timeout?: number;
	ratelimit_timeout?: number;
}
export default class TwitterParserClass {
	private browser: Browser;
	private page: Page | undefined;
	private proxy_username: string | null;
	private proxy_password: string | null;
	private cookie_path: string;
	private parse_limit: number;
	private scroll_delay: number;
	private scroll_timeout: number;
	private search_url: string;
	private cookies: Cookie[];
	private ratelimit_timeout: number;
	private navigate_attempt: number = 0;
	constructor(
		browser: Browser,
		search_url: string,
		proxy_username: string | null = null,
		proxy_password: string | null = null,
		cookie_path: string = "cookie.json",
		parse_limit: number = 10,
		scroll_delay: number = 1000,
		scroll_timeout: number = 10000,
		ratelimit_timeout: number = 10 * 60 * 1000
	) {
		if (new.target !== TwitterParserClass)
			throw new Error("TwitterParserClass is not callable");
		this.browser = browser;
		this.search_url = search_url;
		this.proxy_username = proxy_username;
		this.proxy_password = proxy_password;
		this.cookie_path = cookie_path;
		this.parse_limit = parse_limit;
		this.scroll_delay = scroll_delay;
		this.scroll_timeout = scroll_timeout;
		this.ratelimit_timeout = ratelimit_timeout;
		this.page = undefined;

		if (!fs.existsSync(path.resolve(this.cookie_path))) {
			this.cookies = [];
			return;
		}
		const read_json = fs.readFileSync(path.resolve(this.cookie_path), "utf-8");
		const parse_json = JSON.parse(read_json);
		if (!Array.isArray(parse_json))
			throw new Error("cookie file is not an array");
		this.cookies = parse_json;
		return;
	}
	public static async initializeWithOptions(
		search_url: string,
		options: TwitterParserClassOptions
	): Promise<TwitterParserClass> {
		return new TwitterParserClass(
			await puppeteer.launch({
				headless: options.headless ?? false,
			}),
			search_url,
			options.proxy_username,
			options.proxy_password,
			options.cookie_path,
			options.parse_limit,
			options.scroll_delay,
			options.scroll_timeout,
			options.ratelimit_timeout
		);
	}
	public static async initialize(
		search_url: string
	): Promise<TwitterParserClass> {
		return new TwitterParserClass(
			await puppeteer.launch({
				headless: false,
			}),
			search_url
		);
	}
	public async authenticate(): Promise<void> {
		if (this.cookies.length > 0)
			this.cookies.map((cookie) => {
				this.browser.setCookie(cookie);
			});
		if (this.page === undefined) this.page = await this.browser.newPage();
		if (this.proxy_password !== null && this.proxy_username !== null)
			await this.page.authenticate({
				username: this.proxy_username,
				password: this.proxy_password,
			});
		await this.page.goto("https://x.com/login");
		await this.page.waitForFunction(
			() => window.location.href === "https://x.com/home"
		);
		consola.success("Successfully logged into twitter");
		const cookies = await this.browser.cookies();
		fs.writeFileSync(this.cookie_path, JSON.stringify(cookies));
		consola.success("Saved new cookie data");
		return;
	}
	public async navigate(): Promise<void> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		await this.page.goto(this.search_url, {
			waitUntil: "networkidle2",
		});
		await this.page.waitForSelector('[aria-label="Timeline: Cari timeline"]', {
			timeout: 5000,
		});
		await new Promise((res) => {
			consola.log("Waiting for full load");
			setTimeout(res, 5000);
		});
		consola.success("Loaded timeline");
		return;
	}
	public async navigateRecursive(): Promise<void> {
		while (true) {
			try {
				await this.navigate();
				break;
			} catch (error: any) {
				if (error.name === "TimeoutError") {
					consola.warn(
						`Ratelimit detected at attempt ${++this
							.navigate_attempt}. Retrying in ${
							this.ratelimit_timeout / 1000 / 60
						} minutes...`
					);
					await new Promise((resolve) =>
						setTimeout(resolve, this.ratelimit_timeout)
					);
				} else {
					throw error;
				}
			}
		}
		return;
	}
	public async scroll(): Promise<void> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		await this.page.evaluate(() => window.scrollBy(0, 100));
	}
	private async getPosts(): Promise<PostRaw[]> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		return (await this.page.evaluate(
			(parse_limit, scroll_timeout) => {
				return new Promise<PostRaw[]>((resolve) => {
					const newData: PostRaw[] = [];
					setTimeout(() => resolve(newData), scroll_timeout);
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
						if (newData.length >= parse_limit) {
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
				});
			},
			this.parse_limit,
			this.scroll_timeout
		)) as PostRaw[];
	}
	public async parse(): Promise<PostRaw[]> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		const scrollinterval = setInterval(
			() => this.page?.evaluate(() => window.scrollBy(0, 100)),
			this.scroll_delay
		);
		const data: PostRaw[] = await this.getPosts();
		clearInterval(scrollinterval);
		return data;
	}
	public getScrollDelay(): number {
		return this.scroll_delay;
	}
	public setSearchURL(url: string): void {
		this.search_url = url;
	}
	public getRatelimitTimeout(): number {
		return this.ratelimit_timeout;
	}
}
