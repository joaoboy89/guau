import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ChatService } from "./chat.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

interface AuthUser {
  id: string;
  role: string;
}

@ApiTags("Chat")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("conversations")
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: "Listar mis conversaciones con último mensaje" })
  getMyConversations(@CurrentUser() user: AuthUser) {
    return this.chat.getMyConversations(user.id, user.role);
  }

  @Get(":id/messages")
  @ApiOperation({ summary: "Obtener mensajes de una conversación" })
  getMessages(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.chat.getMessages(user.id, user.role, id);
  }

  @Post(":id/messages")
  @ApiOperation({ summary: "Enviar un mensaje (detecta info de contacto automáticamente)" })
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.sendMessage(user.id, user.role, id, dto);
  }
}
