import fs from "fs";
import yaml from "js-yaml";
import path from "path";

export default (filePath: string) => {
	try {
		const absolutePath = path.resolve(filePath);

		if (!fs.existsSync(absolutePath)) {
			throw new Error(`YAML file not found: ${absolutePath}`);
		}

		const content = fs.readFileSync(absolutePath, "utf8");

		let parsed;
		try {
			parsed = yaml.load(content);
		} catch (yamlErr: any) {
			throw new Error(`YAML syntax error in ${filePath}: ${yamlErr.message}`);
		}

		// Optional: Validate the result
		if (typeof parsed !== "object" || parsed === null) {
			throw new Error(`Parsed YAML is not a valid object in ${filePath}`);
		}

		return parsed;
	} catch (err: any) {
		console.error(`[YAML LOAD ERROR] ${err.message}`);
		process.exit(1); // Optional: fail fast
	}
};
