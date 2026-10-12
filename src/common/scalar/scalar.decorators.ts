/**
 * Decoradores de documentación de API para Scalar / OpenAPI.
 *
 * Encapsula los decoradores de especificación para que los controladores y DTOs
 * utilicen una abstracción desacoplada de documentación orientada a Scalar.
 */
export {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiConsumes,
  ApiProduces,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiSecurity,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiAcceptedResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  getSchemaPath,
} from '@nestjs/swagger';
