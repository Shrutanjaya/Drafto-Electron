
import { Editor } from "@tiptap/react";
import { createContext, useState } from "react";

type EditorContextType = {
    activeEditor: Editor | null;
    setActiveEditor: (editor: Editor) => void;
}

export const EditorContext = createContext<EditorContextType>({
    activeEditor: null,
    setActiveEditor: () => {},
});

export const EditorProvider = ({ children }: { children: React.ReactNode }) => {
    const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

    return (
        <EditorContext.Provider value={{ activeEditor, setActiveEditor }}>
            {children}
        </EditorContext.Provider>
    );
}
