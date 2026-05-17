import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: "http://localhost:4567/api/graphql",
  documents: "src/api/graphql/**/*.graphql",
  generates: {
    "src/api/graphql/generated/graphql.ts": {
      plugins: [
        {
          add: {
            content: "// @ts-nocheck\n/* eslint-disable */"
          }
        },
        "typescript",
        "typescript-operations",
        "typescript-graphql-request"
      ],
      config: {
        skipTypename: false,
        withHooks: false,
        withHOC: false,
        withComponent: false,
      }
    }
  }
};

export default config;
