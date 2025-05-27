import { Request, Response, NextFunction } from "express";
import { CLIArgs, ConfigType } from "../../types";
import { DefaultResponse } from "../types";
import consola from "consola";
import LogModel, { LogDocument } from "../../database/log_model";
import PostModel, { PostDocument } from "../../database/post_model";
import load_yaml from "../../lib/load_yaml";

interface StatusReport {
	parsing_start_date: Date;
	current_timeline_from: Date;
	current_timeline_until: Date;
	configuration: ConfigType;
	document_count: number;
	latest_documents: PostDocument[];
}

export default (args: CLIArgs) => {
	consola.success("Creating GET: STATUS route handler");
	return async (req: Request, res: Response, next: NextFunction) => {
		let logdata: LogDocument | null = null;
		if (args.mode === "custom") {
			const id = args.id;
			logdata = await LogModel.findById(id).catch((err) => null);
		} else {
			logdata = await LogModel.findOne()
				.sort({
					started_at: -1,
				})
				.catch((err) => null);
		}
		if (logdata === null) throw new Error("Unable to find log data");

		const document_count = await PostModel.estimatedDocumentCount();
		const latest_documents = await PostModel.find()
			.sort({ created_at: -1 })
			.limit(10);

		try {
			res.status(200).json({
				status: 200,
				message: "OK",
				code: "OK",
				data: {
					parsing_start_date: logdata.started_at,
					current_timeline_from: logdata.smallest_date,
					current_timeline_until: logdata.timeline_start_date,
					configuration: load_yaml(args),
					document_count,
					latest_documents,
				},
			} as DefaultResponse<StatusReport>);
		} catch (e: any) {
			next(e);
		}
	};
};
