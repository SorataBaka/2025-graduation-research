import puppeteer, { Browser, Page, Cookie } from "puppeteer";
import fs from "fs";
import consola from "consola";

export default class ParseClass {
	private browser: Browser;
	private page: Page | undefined;
	private cookies: Cookie[] | undefined;
	private cookiePath: string;

	constructor(browser: Browser, cookiePath: string) {
		this.cookiePath = cookiePath;
		this.page = undefined;
		this.browser = browser;

		//Check if cookies file exist.
		if (!fs.existsSync(cookiePath)) return;
		this.cookies = JSON.parse(fs.readFileSync(cookiePath, "utf-8")) as Cookie[];
		if (this.cookies === undefined) return;
		for (const cookie of this.cookies) {
			this.browser.setCookie(cookie);
		}
	}
	public static async initialize(cookiePath: string): Promise<ParseClass> {
		return new ParseClass(
			await puppeteer.launch({
				headless: false,
			}),
			cookiePath
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

	public async search(searchQuery: string): Promise<ParseClass> {
		if (this.page === undefined) throw new Error("Page is still undefined");
		await this.page.goto(
			`https://x.com/search?f=top&q=${encodeURIComponent(
				searchQuery
			)}&src=typed_query`,
			{
				waitUntil: "networkidle2",
			}
		);
		await this.page.waitForSelector(
			"#react-root > div > div > div.css-175oi2r.r-1f2l425.r-13qz1uu.r-417010.r-18u37iz > main > div > div > div > div > div > div:nth-child(3) > section > div > div",
			{
				timeout: 10000,
			}
		);
		consola.success("Opened search timeline");

		return this;
	}

	public async observe() {
		if (this.page === undefined) throw new Error("Page is still undefined");
		await this.page.evaluate(() => {
			const observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.addedNodes.length > 0) console.log(mutation.addedNodes);
				});
			});
			const container = document.querySelector(
				"#react-root > div > div > div.css-175oi2r.r-1f2l425.r-13qz1uu.r-417010.r-18u37iz > main > div > div > div > div > div > div:nth-child(3) > section > div > div"
			);
			if (!container) throw new Error("Element not found");
			observer.observe(container, {
				childList: true,
				subtree: true,
			});
		});
	}
}
