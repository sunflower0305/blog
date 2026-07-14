const TIPTAP_V2 = "2.27.2";

function pinTiptapV2Dependency(pkg, name) {
  pkg.dependencies = { ...pkg.dependencies, [name]: TIPTAP_V2 };

  if (pkg.peerDependencies) {
    delete pkg.peerDependencies[name];
  }
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.version !== TIPTAP_V2) return pkg;

      if (pkg.name === "@tiptap/extension-code-block-lowlight") {
        pinTiptapV2Dependency(pkg, "@tiptap/core");
        pinTiptapV2Dependency(pkg, "@tiptap/pm");
        pinTiptapV2Dependency(pkg, "@tiptap/extension-code-block");
      }

      if (pkg.name === "@tiptap/extension-code-block") {
        pinTiptapV2Dependency(pkg, "@tiptap/core");
        pinTiptapV2Dependency(pkg, "@tiptap/pm");
      }

      return pkg;
    },
  },
};
