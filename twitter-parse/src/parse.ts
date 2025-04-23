import puppeteer, { Browser, Page, Cookie } from "puppeteer";
import fs from "fs";
import consola from "consola";

export default class ParseClass {
	private browser: Browser;
	private page: Page | undefined;
	private cookies: Cookie[] | undefined;
	private cookiePath: string;
	private static activeClass: ParseClass;

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
		ParseClass.activeClass = this;
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
		await this.page.waitForSelector('[aria-label="Timeline: Cari timeline"]', {
			timeout: 10000,
		});
		await new Promise((res) => {
			consola.warn("Waiting for full load");
			setTimeout(res, 2000);
		});
		consola.success("Opened search timeline");

		return this;
	}

	public async observe() {
		if (this.page === undefined) throw new Error("Page is still undefined");
		await this.page.evaluate(async () => {
			const observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.addedNodes.length == 0) return;
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
						const time = insideContent
							.querySelector(
								"div:nth-of-type(1) > div > div:nth-of-type(1) > div > div > div:nth-of-type(2) > div > div:nth-of-type(3) > a > time"
							)
							?.getAttribute("datetime");
					});
				});
			});
			const container = document.querySelector(
				'[aria-label="Timeline: Cari timeline"] > div'
			);
			if (container == null) throw new Error("Element not found");
			observer.observe(container, {
				childList: true,
			});
			console.log(container);

			while (true) {
				window.scrollBy(0, 100);
				await new Promise((res) => setTimeout(res, 200));
			}
		});
	}
}
