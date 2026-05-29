import { findByProps, findByName } from "@vendetta/metro";
import { before, after, instead } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";

// ─── Patch storage ───────────────────────────────────────────────────────────
const patches: (() => void)[] = [];

// ─── Find relevant modules ───────────────────────────────────────────────────

// Módulo responsável por tratar notificações de chamada (ringtone, vibração etc.)
const CallModule = findByProps("ringIncomingCall", "stopRinging");

// Módulo de notificações nativas do Android/iOS
const NotificationModule = findByProps("showNotification", "localNotification");

// Módulo de canal de notificação
const NotificationChannelModule = findByProps(
  "setNotificationChannel",
  "INCOMING_CALL_CHANNEL",
  "DEFAULT_CHANNEL"
);

// Módulo que decide o tipo de notificação a ser exibida
const PushNotificationModule = findByProps(
  "handlePushNotification",
  "handleNotification"
);

// ─── Plugin lifecycle ─────────────────────────────────────────────────────────

export default {
  onLoad() {
    // 1) Impede que o Discord toque o ringtone de chamada
    if (CallModule?.ringIncomingCall) {
      patches.push(
        before("ringIncomingCall", CallModule, (args) => {
          // Retorna false-ish / cancela a execução original
          return [null];
        })
      );
    }

    // 2) Impede que o Discord pare o ringing (não precisamos parar o que não tocou)
    if (CallModule?.stopRinging) {
      patches.push(
        before("stopRinging", CallModule, () => {
          return [];
        })
      );
    }

    // 3) Redireciona notificações de chamada para o canal de mídia padrão
    if (NotificationChannelModule) {
      // Sobrescreve o canal de chamadas para usar o canal padrão de notificações
      patches.push(
        instead(
          "setNotificationChannel",
          NotificationChannelModule,
          (args, orig) => {
            // Se o canal for o de chamadas, troca para o canal padrão (mídia/mensagens)
            if (
              args[0] === NotificationChannelModule.INCOMING_CALL_CHANNEL ||
              String(args[0]).toLowerCase().includes("call")
            ) {
              args[0] =
                NotificationChannelModule.DEFAULT_CHANNEL ??
                "com.discord.default";
            }
            return orig(...args);
          }
        )
      );
    }

    // 4) Patch principal: intercepta notificações push do tipo CALL e as reescreve como MESSAGE
    if (PushNotificationModule?.handlePushNotification) {
      patches.push(
        before("handlePushNotification", PushNotificationModule, (args) => {
          const payload = args[0];
          if (!payload) return;

          // Tipos conhecidos de notificação de chamada no Discord
          const callTypes = [
            "CALL",
            "incoming_call",
            "voice_channel_effect",
            "RING",
          ];

          if (
            payload.type &&
            callTypes.some((t) =>
              String(payload.type).toUpperCase().includes(t.toUpperCase())
            )
          ) {
            // Reescreve o payload para parecer uma mensagem/mídia
            args[0] = {
              ...payload,
              type: "MESSAGE",
              // Remove flags que acionam o comportamento de chamada full-screen
              call: undefined,
              ring: undefined,
              channelType: undefined,
              // Mantém título e corpo mas reformata
              title: payload.title ?? "📞 Chamada recebida",
              body:
                payload.body ??
                `${payload.sender ?? "Alguém"} está te chamando`,
              // Força ícone de mensagem padrão
              smallIcon: "ic_notification",
              notificationCategory: "message",
            };
          }
        })
      );
    }

    // 5) Patch no handleNotification (caminho alternativo usado em algumas versões)
    if (PushNotificationModule?.handleNotification) {
      patches.push(
        before("handleNotification", PushNotificationModule, (args) => {
          const notification = args[0];
          if (!notification) return;

          if (
            notification.call ||
            notification.ring ||
            String(notification.type ?? "").toUpperCase().includes("CALL")
          ) {
            args[0] = {
              ...notification,
              call: undefined,
              ring: undefined,
              type: "message",
              importance: 3, // IMPORTANCE_DEFAULT — sem som de chamada
              category: "msg",
            };
          }
        })
      );
    }

    showToast("CallsAsMedia ativado ✅", { key: "calls-as-media" });
  },

  onUnload() {
    // Remove todos os patches ao desativar
    patches.forEach((unpatch) => unpatch());
    patches.length = 0;
    showToast("CallsAsMedia desativado ❌", { key: "calls-as-media" });
  },
};
