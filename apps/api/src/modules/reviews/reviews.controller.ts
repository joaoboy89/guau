import { Controller, Post, Get, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ReviewsService } from "./reviews.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";

interface AuthUser {
  id: string;
  role: string;
}

@ApiTags("Reviews")
@Controller("reviews")
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.WALKER)
  @ApiOperation({ summary: "Calificar al otro participante de un paseo completado (1-5 estrellas)" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.id, user.role, dto);
  }

  @Get("walker/:id")
  @ApiOperation({ summary: "Ver reviews públicas de un paseador (por WalkerProfile ID)" })
  getWalkerReviews(@Param("id") id: string) {
    return this.reviews.getWalkerReviews(id);
  }
}
