interface DefaultResponse<DataType> {
	status: number;
	message: string;
	code: string;
	data: DataType;
}
interface ErrorResponse {
	status: number;
	message: string;
	code: string;
}
interface RouteResponse {
	status: number;
	message: string;
	code: string;
	path: string;
}
interface ApiOptions {
	port: number;
}

export { DefaultResponse, ApiOptions, ErrorResponse, RouteResponse };
