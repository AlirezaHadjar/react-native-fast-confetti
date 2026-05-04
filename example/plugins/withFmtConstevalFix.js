const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# fmt-consteval-fix (config plugin)';

const HELPERS_RUBY = `
def __fmt_xcode_version
  output = \`xcodebuild -version 2>/dev/null\`
  version = output[/Xcode\\s+(\\d+(?:\\.\\d+)*)/, 1]
  version ? Gem::Version.new(version) : Gem::Version.new('0')
rescue
  Gem::Version.new('0')
end

def __patch_fmt_consteval(installer)
  return unless __fmt_xcode_version >= Gem::Version.new('26.4')

  fmt_base = File.join(installer.sandbox.pod_dir('fmt'), 'include', 'fmt', 'base.h')
  unless File.exist?(fmt_base)
    Pod::UI.warn "Skipping fmt consteval patch: #{fmt_base} not found"
    return
  end

  content = File.read(fmt_base)
  patched = content.gsub(/^(\\s*#\\s*define\\s+FMT_USE_CONSTEVAL\\s+)1(\\s*)$/) { "#{$1}0#{$2}" }

  if patched != content
    File.chmod(0644, fmt_base)
    File.write(fmt_base, patched)
    Pod::UI.puts 'Patched fmt FMT_USE_CONSTEVAL=0 for Xcode 26.4+'
  end
end
`;

const CALL_RUBY = `    # Work around Xcode 26.4 fmt consteval build failures (RN issue #55601).
    __patch_fmt_consteval(installer)`;

function patchPodfile(contents) {
  if (contents.includes(MARKER)) return contents;

  const helpersAnchor = 'prepare_react_native_project!';
  if (!contents.includes(helpersAnchor)) {
    throw new Error(
      "withFmtConstevalFix: anchor 'prepare_react_native_project!' not found in Podfile"
    );
  }

  const callAnchor = /(post_install do \|installer\|\n)/;
  if (!callAnchor.test(contents)) {
    throw new Error(
      "withFmtConstevalFix: anchor 'post_install do |installer|' not found in Podfile"
    );
  }

  let next = contents.replace(
    helpersAnchor,
    `${MARKER}\n${HELPERS_RUBY}\n${helpersAnchor}`
  );
  next = next.replace(callAnchor, `$1${CALL_RUBY}\n\n`);
  return next;
}

const withFmtConstevalFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile'
      );
      const original = fs.readFileSync(podfilePath, 'utf8');
      const next = patchPodfile(original);
      if (next !== original) fs.writeFileSync(podfilePath, next);
      return cfg;
    },
  ]);
};

module.exports = withFmtConstevalFix;
