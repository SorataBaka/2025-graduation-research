import { Request, Response, NextFunction } from "express";
import DatabaseClass from "../../../db/init_db";
import { DefaultResponse } from "../../../..";
import joi from "joi";

const bodyValidator = joi.object({
	time: joi.string().required(),
	author: joi.string().required(),
	content: joi.string().required(),
	comment_count: joi.number().required(),
	repost_count: joi.number().required(),
	like_count: joi.number().required(),
	view_count: joi.number().required(),
});

interface BodyInterface {
	time: string;
	author: string;
	content: string;
	comment_count: number;
	repost_count: number;
	like_count: number;
	view_count: number;
}

export default async (req: Request, res: Response, next: NextFunction) => {
	try {
		if (!req.body) throw new Error("Invalid request body");
		const validatedBody = bodyValidator.validate(req.body);
		if (validatedBody.error) throw validatedBody.error;

		const body = validatedBody.value as BodyInterface;
		const databaseDocument = new DatabaseClass.postCollection({
			time: new Date(body.time),
			author: body.author,
			content: body.content,
			comment_count: body.comment_count,
			like_count: body.like_count,
			repost_count: body.repost_count,
			view_count: body.view_count,
			created_at: Date.now(),
		});
		const savedDocument = await databaseDocument.save();

		res.status(200).json({
			status: 200,
			code: "OK",
			message: "OK",
			data: savedDocument,
		} as DefaultResponse<typeof savedDocument>);
		return;
	} catch (e) {
		next(e);
	}
};
