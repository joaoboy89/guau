import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { HealthService } from "./health.service";
import { PrismaService } from "../../database/prisma.service";

describe("HealthService", () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<HealthService>(HealthService);

    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe("checkDatabase()", () => {
    it("la base OK: devuelve true", async () => {
      prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
      await expect(service.checkDatabase()).resolves.toBe(true);
    });

    it("la base caida: devuelve false, sin tirar la excepcion hacia arriba", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));
      await expect(service.checkDatabase()).resolves.toBe(false);
    });
  });
});
