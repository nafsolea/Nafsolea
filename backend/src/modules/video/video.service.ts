import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addMinutes } from 'date-fns';

interface DailyRoom {
  id: string;
  name: string;
  url: string;
}

interface DailyMeetingToken {
  token: string;
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.get<string>('daily.apiKey')!;
    this.apiUrl = config.get<string>('daily.apiUrl', 'https://api.daily.co/v1');
  }

  // ── Create a Daily.co room for a session ─────────────────────────

  async createRoom(appointmentId: string, scheduledAt: Date, durationMinutes: number): Promise<DailyRoom> {
    // Room expires 30 min after session should end
    const nbf = Math.floor(scheduledAt.getTime() / 1000) - 15 * 60; // available 15min early
    const exp = Math.floor(addMinutes(scheduledAt, durationMinutes + 30).getTime() / 1000);

    const roomName = `nafsolea-${appointmentId}-${Date.now()}`;

    const response = await fetch(`${this.apiUrl}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'private',       // only token holders can join
        properties: {
          nbf,                    // not-before timestamp
          exp,                    // auto-expire room
          max_participants: 2,    // patient + psychologist only
          enable_recording: false, // RGPD: no recording by default
          enable_chat: true,
          start_video_off: false,
          start_audio_off: false,
          lang: 'fr',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Daily.co room creation failed: ${error}`);
      throw new BadRequestException('Impossible de créer la salle de consultation');
    }

    return response.json() as Promise<DailyRoom>;
  }

  // ── Create participant token ──────────────────────────────────────

  async createMeetingToken(
    roomName: string,
    participantName: string,
    isOwner: boolean,
  ): Promise<string> {
    const response = await fetch(`${this.apiUrl}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: participantName,
          is_owner: isOwner,       // psychologist is room owner (can mute, etc.)
          enable_recording: false,
          exp: Math.floor(Date.now() / 1000) + 2 * 3600, // 2h max
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (!response.ok) {
      throw new BadRequestException('Impossible de créer le token vidéo');
    }

    const data = await response.json() as DailyMeetingToken;
    return data.token;
  }

  // ── Delete room after session / cancellation ─────────────────────

  async deleteRoom(roomName: string): Promise<void> {
    await fetch(`${this.apiUrl}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}
