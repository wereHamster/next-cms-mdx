import React from "react";
import { GetStaticProps } from "next";
import { MDXProvider, mdx } from "@mdx-js/react";

interface Props {
  content: any;
}

const components = {
  Button: ({ children }) => {
    return (
      <div className="button">
        <button>{children}</button>
      </div>
    );
  },
};

export default ({ content }: Props) => {
  return <MDXProvider components={components}>{render(content)}</MDXProvider>;
};

function render(node) {
  if (Array.isArray(node)) {
    const [type, props, ...children] = node;
    return mdx(type || React.Fragment, props, ...(children?.map(render) ?? []));
  } else {
    return node;
  }
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { read } = require("to-vfile");
  const unified = require("unified");
  const toMDAST = require("remark-parse");
  const remarkMdx = require("remark-mdx");
  const { transformSync } = require("@babel/core");
  const { default: generate } = require("@babel/generator");

  const fn = unified()
    .use(toMDAST)
    .use(remarkMdx)
    .use(mdxAstToMdxHast)
    .use(function () {
      this.Compiler = function (tree) {
        function go({ type, position, children, ...node }) {
          // console.log(type, node);
          if (type === "root") {
            return [null, {}, ...(children?.map(go) ?? [])];
          } else if (type === "element") {
            return [
              node.tagName,
              node.properties,
              ...(children?.map(go) ?? []),
            ];
          } else if (type === "text") {
            return node.value;
          } else if (type === "jsx") {
            const { ast } = transformSync(node.value, {
              configFile: false,
              babelrc: false,
              ast: true,
              presets: [
                [require("@babel/preset-react"), { pragma: "createElement" }],
              ],
              plugins: [require("@babel/plugin-syntax-object-rest-spread")],
            });

            const code = generate(ast).code.replace(
              /createElement\(([A-Z][a-zA-Z0-9_]*)/,
              `createElement("$1"`
            );
            // console.log(code);

            const value = eval(`
function createElement(type, props, ...children) { return [type, props || {}, ...children]; }

${code}`);

            return value;
          } else {
            // console.log("UNKNOWN NODE", type, node);
            throw new Error("UNKNOWN NODE");
          }
        }

        return go(tree);
      };
    });

  const jsx = await fn.process(await read("content/index.mdx"));
  // console.log(jsx.result);

  return {
    props: {
      content: jsx.result,
    },
  };
};

function mdxAstToMdxHast() {
  const toHAST = require("mdast-util-to-hast");

  return (tree, _file) => {
    const handlers = {
      jsx(h, node) {
        return { ...node, type: "jsx" };
      },
    };

    const hast = toHAST(tree, {
      handlers,
      // Enable passing of HTML nodes to HAST as raw nodes
      allowDangerousHtml: true,
    });

    return hast;
  };
}
