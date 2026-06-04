# Tool Usage Notes

Use the narrowest structured tool that directly matches the task. If a tool fails, read the error and retry with a different approach.

When the user asks to inspect, read, write, list, find, or search workspace files, use the file/search tools. Do not guess file contents from memory.

Use `read_file` for specific file paths, `list_dir` for directory contents, `find_files` for filename patterns, `grep` for project text searches, and `write_file` only when the user asks you to create or modify a file.
