export interface Cookie {
	domain: string;
	expirationDate: float;
	hostOnly: boolean;
	httpOnly: boolean;
	name: string;
	path: string;
	sameSite: string;
	secure: boolean;
	session: boolean;
	value: string;
	id: number;
}

export interface DefaultResponse<DataType> {
	status: number;
	message: string;
	code: string;
	data: DataType;
}
export interface ErrorResponse<Error> {
	status: number;
	message: string;
	code: string;
	error: Error;
}

export interface NotFoundResponse {
	status: number;
	message: string;
	code: string;
}
