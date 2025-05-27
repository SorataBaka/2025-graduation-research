import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { CLIArgs } from "../types";
import configvalidation from "../schema/config_validation";
import { ConfigType } from "../types";

export default (args: CLIArgs): ConfigType => {
	const configfilepath = path.resolve(args.config);
	if (!fs.existsSync(configfilepath))
		throw new Error("Configuration file is not found");
	const readyaml = yaml.load(fs.readFileSync(configfilepath, "utf-8"));
	const validadateObject = configvalidation.validate(readyaml);
	if (validadateObject.error) throw validadateObject.error;
	const config = validadateObject.value as ConfigType;
	return config;
};
