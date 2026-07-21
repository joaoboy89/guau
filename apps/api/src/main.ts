import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import * as basicAuth from "express-basic-auth";
import * as cookieParser from "cookie-parser";
import { Request, Response, NextFunction } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Detrás de Cloudflare Tunnel, confiar en el primer proxy para que
  // req.ip refleje la IP real del cliente (relevante para rate limiting).
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  app.use(cookieParser());

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const config = new DocumentBuilder()
    .setTitle("Güau API")
    .setDescription("Marketplace de paseo de perros — Buenos Aires")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Basic Auth para /docs y /docs-json en producción — debe ir ANTES de SwaggerModule.setup
  if (process.env.NODE_ENV === "production") {
    const auth = basicAuth({
      users: { [process.env.SWAGGER_USER ?? "admin"]: process.env.SWAGGER_PASSWORD ?? "" },
      challenge: true,
    });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/docs")) return auth(req, res, next);
      next();
    });

    if (!process.env.SWAGGER_PASSWORD) {
      console.warn("SWAGGER_PASSWORD no configurada — /docs quedará inaccesible en producción.");
    }
  }

  SwaggerModule.setup("docs", app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port, "0.0.0.0");
  console.log(`Güau API corriendo en puerto ${port}`);
  console.log(`Swagger docs en http://localhost:${port}/docs`);
}

bootstrap();
