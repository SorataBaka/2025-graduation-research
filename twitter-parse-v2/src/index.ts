import dotenv from "dotenv";
import consola from "consola";
import initialize_db from "./database/initialize_db";
import parseContinue from "./parse_methods/continue";
import parseCustom from "./parse_methods/custom";
import parseDefault from "./parse_methods/default";
dotenv.config();

const proxy_username = process.env.PROXY_USERNAME || "";
const proxy_password = process.env.PROXY_PASSWORD || "";
const mongodb_uri = process.env.MONGODB_URI || undefined;

const proxy_enabled = proxy_username !== "" && proxy_password !== "";
if (!proxy_enabled) consola.warn("Proxy authentication disabled");
else consola.warn("Running with proxy");
if (mongodb_uri === undefined) throw new Error("MONGODB_URI is not provided");

const searchParameters = [
	"#TolakRUUTNI",
	"#RUUTNI",
	'"RUU TNI"',
	'"demo mahasiswa"',
	'"unjuk rasa"',
	'"demonstrasi"',
	"#DukungRUUTNI",
	'"Dukung RUU TNI"',
	"#RUUTNIPerkuatNKRI",
	"#GagalkanRUUTNI",
	"#CabutRUUTNI",
	"#PeringatanDarurat",
	"#IndonesiaGelap",
	"#TolakRevisiUUTNI",
	"#TolakDwifungsiABRI",
	'"dwifungsi"',
];
async function execute() {
	await initialize_db(mongodb_uri as string);
	const flag = process.argv[2];
	switch (flag) {
		case "--continue":
			consola.warn("Starting in continuation mode");
			await parseContinue(searchParameters, {
				username: proxy_username,
				password: proxy_password,
			});
			break;
		case "--custom":
			const id = process.argv[3];
			if (id.length === 0) throw new Error("Please provide id argument");
			consola.warn("Starting in custom mode with id: ", id);
			await parseCustom(
				searchParameters,
				{
					username: proxy_username,
					password: proxy_password,
				},
				id
			);
			break;
		default:
			consola.warn("Starting in default mode");
			await parseDefault(searchParameters, {
				username: proxy_username,
				password: proxy_password,
			});
	}
}
execute();
