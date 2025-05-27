import { Request, Response, NextFunction } from "express";
import { ErrorResponse } from "../types";
import consola from "consola";
export default async (
	error: any,
	req: Request,
	res: Response,
	next: NextFunction
) => {
	if (!error) next(null);
	consola.error(error.stack);
	res.status(500).json({
		status: 500,
		message: error.message,
		code: "INTERNALERROR",
	} as ErrorResponse);
};
