import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { WalkStatus, UserRole } from "@prisma/client";

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  // ─── Crear review ────────────────────────────────────────

  async create(userId: string, role: string, dto: CreateReviewDto) {
    const { walkId, revieweeId, rating, comment } = dto;

    // 1. Paseo debe existir y estar completado
    const walk = await this.prisma.walk.findUnique({
      where: { id: walkId },
      include: {
        walker: { include: { user: { select: { id: true } } } },
        participants: { include: { owner: { include: { user: { select: { id: true } } } } } },
      },
    });

    if (!walk) throw new NotFoundException("Paseo no encontrado");
    if (walk.status !== WalkStatus.COMPLETED) {
      throw new BadRequestException("Solo podés calificar un paseo que ya fue completado");
    }

    // 2. Validar que el reviewer participó del paseo y que el reviewee es el otro participante
    if (role === UserRole.OWNER) {
      const ownerParticipant = walk.participants.find(
        (p) => p.owner.user.id === userId
      );
      if (!ownerParticipant) {
        throw new ForbiddenException("No sos participante de este paseo");
      }
      if (revieweeId !== walk.walker.user.id) {
        throw new BadRequestException("Como dueño, solo podés calificar al paseador de este paseo");
      }
    } else if (role === UserRole.WALKER) {
      if (walk.walker.user.id !== userId) {
        throw new ForbiddenException("No sos el paseador de este paseo");
      }
      const isValidReviewee = walk.participants.some(
        (p) => p.owner.user.id === revieweeId
      );
      if (!isValidReviewee) {
        throw new BadRequestException("Solo podés calificar a los dueños que participaron en este paseo");
      }
    } else {
      throw new ForbiddenException("Solo dueños y paseadores pueden dejar reviews");
    }

    // 3. Verificar que el reviewee existe
    const reviewee = await this.prisma.user.findUnique({ where: { id: revieweeId } });
    if (!reviewee) throw new NotFoundException("El usuario a calificar no existe");

    // 4. Evitar review duplicada (la constraint @@unique en DB lo atraparía igual)
    const existing = await this.prisma.review.findUnique({
      where: { walkId_reviewerId: { walkId, reviewerId: userId } },
    });
    if (existing) {
      throw new ConflictException("Ya calificaste este paseo");
    }

    // 5. Crear la review
    const review = await this.prisma.review.create({
      data: { walkId, reviewerId: userId, revieweeId, rating, comment },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        reviewee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // 6. Actualizar rating del paseador si el reviewee es el walker
    if (revieweeId === walk.walker.user.id) {
      await this.updateWalkerRating(walk.walker.id, rating);
    }

    return review;
  }

  // ─── Reviews públicas de un paseador ────────────────────

  async getWalkerReviews(walkerProfileId: string) {
    const walker = await this.prisma.walkerProfile.findUnique({
      where: { id: walkerProfileId },
      select: { userId: true, rating: true, totalReviews: true },
    });
    if (!walker) throw new NotFoundException("Paseador no encontrado");

    // Reviews públicas — los reseñadores son dueños, no paseadores
    // verificados. Mismo criterio que en WalkersService: solo nombre de
    // pila, el apellido no viaja.
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: walker.userId },
      include: {
        reviewer: { select: { id: true, firstName: true, avatarUrl: true } },
        walk: { select: { scheduledAt: true, walkType: { select: { label: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      rating: walker.rating,
      totalReviews: walker.totalReviews,
      reviews,
    };
  }

  // ─── Helpers privados ────────────────────────────────────

  private async updateWalkerRating(walkerProfileId: string, newRating: number) {
    const walker = await this.prisma.walkerProfile.findUnique({
      where: { id: walkerProfileId },
      select: { rating: true, totalReviews: true },
    });
    if (!walker) return;

    const updatedTotal = walker.totalReviews + 1;
    // Promedio ponderado: no recalcula desde todas las reviews, opera incrementalmente
    const updatedRating =
      (walker.rating * walker.totalReviews + newRating) / updatedTotal;

    await this.prisma.walkerProfile.update({
      where: { id: walkerProfileId },
      data: {
        rating: Math.round(updatedRating * 100) / 100, // 2 decimales
        totalReviews: updatedTotal,
      },
    });
  }
}
