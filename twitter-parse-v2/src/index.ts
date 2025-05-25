import dotenv from "dotenv";
import consola from "consola";
import yargs from "yargs";
import initialize_db from "./database/initialize_db";
import parseContinue from "./parse_methods/continue";
import parseCustom from "./parse_methods/custom";
import parseDefault from "./parse_methods/default";
import { isValidObjectId } from "mongoose";
import path from "path";
import fs from "fs";
import joi from "joi";
dotenv.config();

const proxy_username = process.env.PROXY_USERNAME || "";
const proxy_password = process.env.PROXY_PASSWORD || "";
const mongodb_uri = process.env.MONGODB_URI || undefined;

const proxy_enabled = proxy_username !== "" && proxy_password !== "";
if (!proxy_enabled) consola.warn("Proxy authentication disabled");
else consola.warn("Running with proxy");
if (mongodb_uri === undefined) throw new Error("MONGODB_URI is not provided");

// const searchParameters = [
// 	"#TolakRUUTNI",
// 	"#RUUTNI",
// 	'"RUU TNI"',
// 	'"demo mahasiswa"',
// 	'"unjuk rasa"',
// 	'"demonstrasi"',
// 	"#DukungRUUTNI",
// 	'"Dukung RUU TNI"',
// 	"#RUUTNIPerkuatNKRI",
// 	"#GagalkanRUUTNI",
// 	"#CabutRUUTNI",
// 	"#PeringatanDarurat",
// 	"#IndonesiaGelap",
// 	"#TolakRevisiUUTNI",
// 	"#TolakDwifungsiABRI",
// 	'"dwifungsi"',
// ];
// async function execute() {
// 	await initialize_db(mongodb_uri as string);
// 	const flag = process.argv[2];
// 	switch (flag) {
// 		case "--continue":
// 			consola.warn("Starting in continuation mode");
// 			await parseContinue(searchParameters, {
// 				username: proxy_username,
// 				password: proxy_password,
// 			});
// 			break;
// 		case "--custom":
// 			const id = process.argv[3];
// 			if (id.length === 0) throw new Error("Please provide id argument");
// 			consola.warn("Starting in custom mode with id: ", id);
// 			await parseCustom(
// 				searchParameters,
// 				{
// 					username: proxy_username,
// 					password: proxy_password,
// 				},
// 				id
// 			);
// 			break;
// 		default:
// 			consola.warn("Starting in default mode");
// 			await parseDefault(searchParameters, {
// 				username: proxy_username,
// 				password: proxy_password,
// 			});
// 	}
// }

const configvalidation = joi.object({
	search_parameters: joi.array().items(joi.string()),
	parse_limit: joi.number(),
	scroll_delay: joi.number(),
	ratelimit_timeout: joi.number(),
	scroll_timeout: joi.number(),
});

const args = yargs
	.locale("en")
	.option("config", {
		alias: "c",
		describe: "Config file path",
		type: "string",
		default: "config.yaml",
	})
	.option("mode", {
		alias: "m",
		describe: "Parsing mode",
		type: "string",
		default: "default",
		choices: ["continue", "custom", "default"] as const,
	})
	.option("id", {
		describe: "log id when mode is set to continue or custom",
		type: "string",
	})
	.check((argv) => {
		if (argv.mode === "custom" && !argv.id) {
			throw new Error("id must be provided when mode is set to CUSTOM");
		}
		if (argv.id !== undefined && !isValidObjectId(argv.id)) {
			throw new Error("Provided ID must be a valid mongodb document ID");
		}
		return true;
	})
	.check((argv) => {
		if (!argv.config) return true;
		const fullpath = path.resolve(argv.config);
		if (!fs.existsSync(fullpath)) {
			throw new Error("Configuration file is not found. Reading: " + fullpath);
		}
		return true;
	})
	.help()
	.strict()
	.parseSync();

consola.log(args);
