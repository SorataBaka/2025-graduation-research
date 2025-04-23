import { Request, Response, NextFunction } from "express";
import { DefaultResponse } from "../../..";

export default async (req: Request, res: Response, next: NextFunction) => {
	try {
		res.status(200).json({
			status: 200,
			message: "OK",
			code: "OK",
			data: null,
		} as DefaultResponse<null>);
	} catch (e) {
		next(e);
	}
};
