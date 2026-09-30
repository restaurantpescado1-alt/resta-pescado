import { readEnvFile } from "../scripts/env";

// Gives the unit suites the same env precedence as the local scripts, without
// requiring a .dev.vars file to exist.
readEnvFile();
