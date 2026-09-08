import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ReviewsService } from "./reviews.service";
import { PrismaService } from "../../database/prisma.service";

const WALKER_PROFILE_ID = "walker-profile-1";
const WALKER_USER_ID = "walker-user-1";

const OWNER_USER_ID = "owner-user-1";
const WALK_ID = "walk-1";

function buildPrismaMock() {
  return {
    walkerProfile: { findUnique: jest.fn(), update: jest.fn() },
    walk: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    review: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
  };
}

describe("ReviewsService", () => {
  let service: ReviewsService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create() ───────────────────────────────────────────────────────────────

  describe("create()", () => {
    it("camino feliz OWNER→WALKER: la respuesta no lleva el apellido de ninguna de las dos partes", async () => {
      prisma.walk.findUnique.mockResolvedValue({
        id: WALK_ID,
        status: "COMPLETED",
        walker: { id: WALKER_PROFILE_ID, user: { id: WALKER_USER_ID } },
        participants: [{ owner: { user: { id: OWNER_USER_ID } } }],
      });
      prisma.user.findUnique.mockResolvedValue({ id: WALKER_USER_ID });
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue({
        id: "review-1",
        rating: 5,
        comment: "Todo perfecto",
        reviewer: { id: OWNER_USER_ID, firstName: "Ana", avatarUrl: null },
        reviewee: { id: WALKER_USER_ID, firstName: "Juan" },
      });
      prisma.walkerProfile.findUnique.mockResolvedValue({ rating: 4.5, totalReviews: 3 });

      const result = await service.create(OWNER_USER_ID, "OWNER", {
        walkId: WALK_ID,
        revieweeId: WALKER_USER_ID,
        rating: 5,
        comment: "Todo perfecto",
      });

      expect(result.reviewer).not.toHaveProperty("lastName");
      expect(result.reviewee).not.toHaveProperty("lastName");
      // El select que se le pide a Prisma tampoco debe pedir el apellido de nadie
      expect(prisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            reviewer: { select: { id: true, firstName: true, avatarUrl: true } },
            reviewee: { select: { id: true, firstName: true } },
          },
        })
      );
    });
  });

  // ─── getWalkerReviews() ─────────────────────────────────────────────────────

  describe("getWalkerReviews()", () => {
    it("lanza NotFoundException si el paseador no existe", async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue(null);
      await expect(service.getWalkerReviews("walker-99")).rejects.toThrow(NotFoundException);
    });

    it("camino feliz: no incluye el apellido del dueño que reseña (solo nombre de pila en publico)", async () => {
      prisma.walkerProfile.findUnique.mockResolvedValue({
        userId: WALKER_USER_ID,
        rating: 4.8,
        totalReviews: 1,
      });
      prisma.review.findMany.mockResolvedValue([
        {
          id: "review-1",
          rating: 5,
          comment: "Excelente paseador",
          reviewer: { id: "owner-1", firstName: "Ana", avatarUrl: null },
          walk: { scheduledAt: new Date(), walkType: { label: "Paseo corto" } },
        },
      ]);

      const result = await service.getWalkerReviews(WALKER_PROFILE_ID);

      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0].reviewer).toHaveProperty("firstName", "Ana");
      expect(result.reviews[0].reviewer).not.toHaveProperty("lastName");
      // El select que se le pide a Prisma tampoco debe pedir el apellido
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            reviewer: { select: { id: true, firstName: true, avatarUrl: true } },
          }),
        })
      );
    });
  });
});
