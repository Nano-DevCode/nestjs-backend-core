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
  ApiBody,
} from '@nestjs/swagger';
