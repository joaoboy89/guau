import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

function buildResMock() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as { status: jest.Mock; json: jest.Mock };
}

describe("HealthController", () => {
  let controller: HealthController;
  let health: { checkDatabase: jest.Mock };

  beforeEach(async () => {
    health = { checkDatabase: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("base OK: responde 200 con { status: \"ok\" } y NADA MAS", async () => {
    health.checkDatabase.mockResolvedValue(true);
    const res = buildResMock();

    await controller.check(res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: "ok" });
    expect(Object.keys(res.json.mock.calls[0][0])).toEqual(["status"]);
  });

  it("base caida: responde 503 con { status: \"degraded\" } y NADA MAS", async () => {
    health.checkDatabase.mockResolvedValue(false);
    const res = buildResMock();

    await controller.check(res as never);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: "degraded" });
    expect(Object.keys(res.json.mock.calls[0][0])).toEqual(["status"]);
  });
});
