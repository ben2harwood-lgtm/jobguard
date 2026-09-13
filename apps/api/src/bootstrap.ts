import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export const configureOpenApi = (app: INestApplication): object => {
  const config = new DocumentBuilder().setTitle("JobGuard API").setVersion("0.0.0").build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("openapi", app, document);
  return document;
};
