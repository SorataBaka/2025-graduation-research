import dotenv from "dotenv";
import consola from "consola";
import yargs, { config } from "yargs";
import initialize_db from "./database/initialize_db";
import parseContinue from "./parse_methods/continue";
import parseCustom from "./parse_methods/custom";
import parseDefault from "./parse_methods/default";
import { isValidObjectId } from "mongoose";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import "joi-extract-type";
import { CLIArgs, ConfigType } from "./types";
import InitializeAPI from "./api";
import configvalidation from "./schema/config_validation";
import loadYaml from "./lib/load_yaml";

dotenv.config();

const proxy_username = process.env.PROXY_USERNAME || "";
const proxy_password = process.env.PROXY_PASSWORD || "";
const mongodb_uri = process.env.MONGODB_URI || undefined;

const proxy_enabled = proxy_username !== "" && proxy_password !== "";
if (!proxy_enabled) consola.warn("Proxy authentication disabled");
else consola.warn("Running with proxy");
if (mongodb_uri === undefined) throw new Error("MONGODB_URI is not provided");

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
	.option("until", {
		alias: "utl",
		describe: "Parse until date",
		type: "string",
	})
	.option("endpoint", {
		alias: "api",
		describe: "Option to enable endpoint status",
		type: "boolean",
		default: false,
	})
	.option("port", {
		alias: "p",
		describe: "Port for the endpoint",
		type: "number",
		default: 3000,
	})
	.option("headless", {
		alias: "h",
		describe: "Headless mode for the browser",
		type: "boolean",
		default: false,
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
		const fullpath = path.resolve(argv.config);
		if (!fs.existsSync(fullpath)) {
			throw new Error("Configuration file is not found. Reading: " + fullpath);
		}

		const readfile = fs.readFileSync(fullpath, "utf-8");
		const data = yaml.load(readfile);
		const dataValidated = configvalidation.validate(data);
		if (dataValidated.error) throw dataValidated.error;
		return true;
	})
	.check((argv) => {
		if (!argv.until) return true;
		const date = new Date(argv.until);
		if (isNaN(date.getTime()))
			throw new Error("Provided date is not a valid date");
		return true;
	})
	.help()
	.strict()
	.parseSync() as CLIArgs;

const execute = async () => {
	await initialize_db(mongodb_uri as string);
	if (args.endpoint)
		InitializeAPI(
			{
				port: args.port,
			},
			args
		);

	const config = loadYaml(args);

	switch (args.mode) {
		case "continue":
			consola.warn("Starting in continuation mode");
			await parseContinue(args, config, {
				username: proxy_username,
				password: proxy_password,
			});
			break;
		case "custom":
			const id = args.id as string;
			if (id.length === 0) throw new Error("Please provide id argument");
			await parseCustom(args, config, {
				username: proxy_username,
				password: proxy_password,
			});
			break;
		default:
			consola.warn("Starting in default mode");
			await parseDefault(args, config, {
				username: proxy_username,
				password: proxy_password,
			});
	}
};
execute();
