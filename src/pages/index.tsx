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
  return (
    <MDXProvider components={components}>
      <div>
        HELLO
        <div>{render(content)}</div>
      </div>
    </MDXProvider>
  );
};

function render(content) {
  return go(content);

  function go({ type, children, ...node }) {
    console.log({ type, children, ...node });
    switch (type) {
      case "root": {
        return <>{children?.map(render)}</>;
      }
      case "element": {
        return mdx(node.tagName, node.props, ...(children?.map(go) ?? []));
      }
      case "text": {
        return node.value;
      }
      case "vdom": {
        function go(node) {
          if (typeof node === "string" || typeof node === "number") {
            return <>{node}</>;
          }

          const { type, props, children } = node;
          return mdx(type, props, ...(children?.map(go) ?? []));
        }

        return go(node.value);
      }
    }

    return <>{type}</>;
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
          if (type === "element") {
            return {
              type: "element",
              tagName: node.tagName,
              props: node.properties,
              ...(children && { children: children?.map(go) }),
            };
          } else if (type === "jsx") {
            const BabelPluginApplyMdxTypeProp = require("babel-plugin-apply-mdx-type-prop");

            const { ast } = transformSync(node.value, {
              configFile: false,
              babelrc: false,
              ast: true,
              presets: [
                [require("@babel/preset-react"), { pragma: "createElement" }],
              ],
              plugins: [
                require("@babel/plugin-syntax-object-rest-spread"),
                new BabelPluginApplyMdxTypeProp().plugin,
              ],
            });

            const code = generate(ast).code.replace(
              /createElement\(([A-Z][a-zA-Z0-9]*)/,
              `createElement("$1"`
            );
            // console.log(code);

            const value = eval(`
const React = require('react')\n

function createElement(type, props, ...children) { return { type, props: props || {}, children }; }

${code}`);

            function serialize(element) {
              const replacer = (key, value) => {
                switch (key) {
                  case "$$typeof":
                  case "_owner":
                  case "_store":
                  case "ref":
                  case "key":
                    return;
                  default:
                    return value;
                }
              };

              return JSON.stringify(element, replacer);
            }

            return {
              type: "vdom",
              value: JSON.parse(serialize(value)),
            };
          } else {
            return {
              type,
              ...node,
              ...(children && { children: children?.map(go) }),
            };
          }
        }

        return go(tree);
      };
    });

  const jsx = await fn.process(await read("content/index.mdx"));
  // console.log(jsx.result.children[1]);

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
