import { tool } from "@opencode-ai/plugin"

interface BackupResult {
  success: boolean
  message: string
  repo?: string
  branch?: string
  commit?: string
  error?: string
}

export default tool({
  description: "Back up a book project to GitHub with automatic versioning. Inits git, creates .gitignore, commits with date-based message, creates GitHub repo if needed, and pushes.",
  args: {
    source_dir: tool.schema.string().describe("Absolute path to the book project directory"),
    commit_message: tool.schema.string().describe("Optional custom commit message. Default: 'Backup YYYY-MM-DD HH:MM'"),
    repo_name: tool.schema.string().describe("Optional GitHub repo name. Defaults to directory name"),
    create_repo: tool.schema.boolean().describe("Create GitHub repo if it doesn't exist (requires gh CLI). Default: true"),
  },
  required: ["source_dir"],
  async execute(args, context) {
    const { directory } = context
    const sourceDir = args.source_dir
    const commitMsg = args.commit_message || `Backup ${new Date().toISOString().replace(/T/, ' ').slice(0, 16)}`
    const repoName = args.repo_name || sourceDir.split(/[\\/]/).pop() || "book-project"
    const createRepo = args.create_repo !== false

    const result: BackupResult = {
      success: false,
      message: "",
    }

    try {
      const { $ } = await import("bun")

      // 1. Init git if not already a repo
      const gitCheck = await $`git -C ${sourceDir} rev-parse --git-dir`.text().catch(() => "")
      if (!gitCheck.trim()) {
        await $`git -C ${sourceDir} init`.text()
        result.message += "Initialized git repo. "
      }

      // 2. Create .gitignore if missing
      const gitignorePath = `${sourceDir}/.gitignore`
      const gitignoreExists = await $`test -f ${gitignorePath}`.then(() => true).catch(() => false)
      if (!gitignoreExists) {
        const gitignoreContent = [
          "# WriterOS book project",
          "*.epub",
          "*.mobi",
          "*.pdf",
          "*.docx",
          "__pycache__/",
          "*.pyc",
          ".DS_Store",
          "Thumbs.db",
          "*.swp",
          "*.swo",
          ".env",
          "node_modules/",
          "dist/",
        ].join("\n")
        await $`echo ${gitignoreContent} > ${gitignorePath}`.text()
        result.message += "Created .gitignore. "
      }

      // 3. Stage all files
      const addResult = await $`git -C ${sourceDir} add -A`.text().catch((e) => {
        throw new Error(`Failed to stage files: ${e.stderr || e.message}`)
      })

      // 4. Check if there's anything to commit
      const status = await $`git -C ${sourceDir} status --porcelain`.text()
      if (!status.trim()) {
        result.success = true
        result.message = "Nothing to commit — working tree clean."
        return {
          result,
          content: [{ type: "text", text: result.message }],
        }
      }

      // 5. Commit
      const commitHash = await $`git -C ${sourceDir} commit -m ${commitMsg}`.text().catch((e) => {
        throw new Error(`Failed to commit: ${e.stderr || e.message}`)
      })
      const hash = commitHash.match(/\[[\w-]+ ([a-f0-9]+)\]/)?.[1] || "unknown"
      result.commit = hash
      result.message += `Committed as ${hash}. `

      // 6. Check gh CLI and push
      const ghAvailable = await $`which gh`.then(() => true).catch(() => false)
      if (!ghAvailable) {
        result.success = true
        result.message += "GitHub CLI not found. Commit exists locally only."
        return {
          result,
          content: [{ type: "text", text: result.message }],
        }
      }

      // 7. Check if remote exists
      const remoteUrl = await $`git -C ${sourceDir} remote get-url origin`.text().catch(() => "")
      if (!remoteUrl.trim() && createRepo) {
        const ghCreate = await $`gh repo create ${repoName} --private --push --source ${sourceDir} --remote origin`.text().catch((e) => {
          throw new Error(`Failed to create GitHub repo: ${e.stderr || e.message}`)
        })
        result.repo = repoName
        result.message += `Created GitHub repo '${repoName}' and pushed. `
      } else if (remoteUrl.trim()) {
        await $`git -C ${sourceDir} push -u origin HEAD`.text().catch((e) => {
          throw new Error(`Failed to push: ${e.stderr || e.message}`)
        })
        result.repo = remoteUrl.trim()
        result.message += "Pushed to existing remote. "
      }

      result.branch = await $`git -C ${sourceDir} rev-parse --abbrev-ref HEAD`.text().then(s => s.trim()).catch(() => "main")
      result.success = true

      return {
        result,
        content: [{ type: "text", text: result.message }],
      }

    } catch (error: any) {
      result.success = false
      result.error = error.message || String(error)
      return {
        result,
        content: [{ type: "text", text: `Error: ${result.error}` }],
      }
    }
  },
})
