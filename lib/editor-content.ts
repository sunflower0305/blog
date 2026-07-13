import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import type { EditorInstance, JSONContent } from "novel";

export function parseEditorHtml(html: string, editor: EditorInstance): JSONContent {
  const container = document.createElement("div");
  container.innerHTML = html;

  return ProseMirrorDOMParser.fromSchema(editor.schema).parse(container).toJSON() as JSONContent;
}

export function setEditorHtmlContent(editor: EditorInstance, html: string): void {
  // tiptap-markdown overrides setContent for string input and parses it as
  // Markdown. Passing parsed JSON keeps existing HTML from being converted a
  // second time, which would split code blocks containing blank lines.
  editor.commands.setContent(parseEditorHtml(html, editor));
}
