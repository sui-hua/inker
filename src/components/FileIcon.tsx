import React from "react";
import iconJava from "../assets/file-icons/java.svg";
import iconTs from "../assets/file-icons/typescript.svg";
import iconReactTs from "../assets/file-icons/react_ts.svg";
import iconJs from "../assets/file-icons/javascript.svg";
import iconReact from "../assets/file-icons/react.svg";
import iconRust from "../assets/file-icons/rust.svg";
import iconPython from "../assets/file-icons/python.svg";
import iconGo from "../assets/file-icons/go.svg";
import iconHtml from "../assets/file-icons/html.svg";
import iconCss from "../assets/file-icons/css.svg";
import iconJson from "../assets/file-icons/json.svg";
import iconMarkdown from "../assets/file-icons/markdown.svg";
import iconYaml from "../assets/file-icons/yaml.svg";
import iconXml from "../assets/file-icons/xml.svg";
import iconConsole from "../assets/file-icons/console.svg";
import iconGit from "../assets/file-icons/git.svg";
import iconDocker from "../assets/file-icons/docker.svg";
import iconImage from "../assets/file-icons/image.svg";
import iconDocument from "../assets/file-icons/document.svg";
import iconVue from "../assets/file-icons/vue.svg";
import iconSvelte from "../assets/file-icons/svelte.svg";
import iconDatabase from "../assets/file-icons/database.svg";

interface FileIconProps {
  filename: string;
  size?: number;
}

function resolveFileIcon(filename: string): string {
  const lower = filename.toLowerCase();
  const ext = lower.split(".").pop() || "";

  // 1. 特殊专属文件
  if (lower.startsWith(".git") || lower === ".gitignore") return iconGit;
  if (lower === "dockerfile" || lower.startsWith("docker-compose")) return iconDocker;

  // 2. 编程语言扩展名匹配 (全量来自 VS Code Material Icon Theme)
  switch (ext) {
    case "java":
      return iconJava;
    case "tsx":
      return iconReactTs;
    case "ts":
      return iconTs;
    case "jsx":
      return iconReact;
    case "js":
    case "mjs":
    case "cjs":
      return iconJs;
    case "rs":
      return iconRust;
    case "py":
      return iconPython;
    case "go":
      return iconGo;
    case "html":
    case "htm":
      return iconHtml;
    case "css":
    case "scss":
    case "less":
      return iconCss;
    case "json":
      return iconJson;
    case "md":
    case "markdown":
      return iconMarkdown;
    case "yml":
    case "yaml":
      return iconYaml;
    case "xml":
      return iconXml;
    case "sh":
    case "bash":
    case "zsh":
      return iconConsole;
    case "vue":
      return iconVue;
    case "svelte":
      return iconSvelte;
    case "sql":
      return iconDatabase;
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "webp":
    case "gif":
    case "ico":
      return iconImage;
    default:
      return iconDocument;
  }
}

export const FileIcon: React.FC<FileIconProps> = ({ filename, size = 18 }) => {
  const iconSrc = resolveFileIcon(filename);

  return (
    <img
      src={iconSrc}
      alt=""
      style={{
        width: `${size}px`,
        height: `${size}px`,
        marginRight: "8px",
        flexShrink: 0,
        display: "inline-block",
        verticalAlign: "middle",
      }}
    />
  );
};
