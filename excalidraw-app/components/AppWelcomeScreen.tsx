import { useI18n } from "@excalidraw/excalidraw/i18n";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";

import { WelcomeLanding } from "./WelcomeLanding";

export const AppWelcomeScreen: React.FC<{ onCreateRoom: () => void }> =
  React.memo(({ onCreateRoom }) => {
    const { t } = useI18n();
    return (
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint>
          {t("welcomeScreen.app.menuHint")}
        </WelcomeScreen.Hints.MenuHint>
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.HelpHint />
        <WelcomeScreen.Center>
          <WelcomeLanding onCreateRoom={onCreateRoom} />
        </WelcomeScreen.Center>
      </WelcomeScreen>
    );
  });