import type { ReactNode } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

type Props = {
    children: ReactNode;
    isGM: boolean;
    revealed: boolean;
    onToggle: () => void;
};

export function Secret({ children, isGM, revealed, onToggle }: Props) {
    if (isGM) {
        return (
            <span className="note-secret-block">
                <span className="note-secret-row">
                    <Lock size={11} className="note-secret-icon" />
                    <span className="note-secret-label">Secret</span>
                    <button
                        className="note-secret-toggle"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle();
                        }}
                        title={
                            revealed
                                ? "Unreveal — hide from players"
                                : "Reveal to players"
                        }
                    >
                        {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
                        <span>{revealed ? "Unreveal" : "Reveal"}</span>
                    </button>
                </span>
                <span className="note-secret-content">{children}</span>
            </span>
        );
    }
    if (!revealed) {
        return (
            <span className="note-secret-block note-secret-locked">
                <span className="note-secret-row">
                    <Lock size={11} className="note-secret-icon" />
                    <span className="note-secret-label">Not yet revealed</span>
                </span>
            </span>
        );
    }
    return (
        <span className="note-secret-block note-secret-revealed">
            <span className="note-secret-row">
                <Eye size={11} className="note-secret-icon" />
                <span className="note-secret-label">Discovered</span>
            </span>
            <span className="note-secret-content">{children}</span>
        </span>
    );
}
