type Props = {
  actions: {
    resume: () => void;
    pause: () => void;
    restart: () => void;
    reset: () => void;
  };
};

export function ConfettiControls(props: Props): React.JSX.Element;
