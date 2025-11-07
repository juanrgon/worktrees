## Function Style

### Prefer single args argument with inline type annotation:

```typescript
// ✅ GOOD
export async function cloneProjectTreeIntoFolder(args: {
  sourceProjectId: string;
  targetProjectId: string;
  userId: string;
}) {
  // implementation
}

// ❌ BAD
export async function cloneProjectTreeIntoFolder(sourceProjectId: string, targetProjectId: string, userId: string) {
  // implementation
}


// ❌ BAD
type ExecQuietArgs = {
  command: string;
  cwd: string;
};
export function execQuiet(args: ExecQuietArgs) {
  return exec({ command: args.command, cwd: args.cwd, silent: true });
}
```

### Avoid explicit return type annotations, i.e. embrace TypeScript's type inference:

```typescript
// ✅ GOOD
export function add(args: {
  num1: number;
  num2: number;
}) {
    return args.num1 + args.num2;
}


// ❌ BAD
export function add(args: {
  num1: number;
  num2: number;
}): number {
    return args.num1 + args.num2;
}
```

### Use kebab-case for file names

```sh
# ✅ GOOD
src/user-details.ts

# ❌ BAD
src/UserDetails.ts
```

## Use as const with lists and objects that are created statically to ensure proper type inference:

```typescript
// ✅ Good - Using as const for static arrays
const ARTIFACTS = ["project", "folder", "document"] as const;
type ArtifactType = (typeof ARTIFACTS)[number]; // 'project' | 'folder' | 'document'

// ✅ Good - Using as const for static objects
const CLI_COMMANDS = {
    clone: "clone",
    sync: "sync",
    publish: "publish",
} as const;

// ✅ Good - Using as const for configuration objects
const API_ENDPOINTS = {
    projects: "/api/projects",
    documents: "/api/documents",
    users: "/api/users",
} as const;

// Avoid - Without as const, types are too broad
const STATUSES = ["pending", "completed"]; // string[] instead of specific literals
```

### Prefer types over interfaces for object shapes

```typescript
// ✅ GOOD
type User = {
  id: string;
  name: string;
};

// ❌ BAD
interface User {
  id: string;
  name: string;
};
```

## Never use enums for string values; prefer objects and lists with derived types instead

```typescript
// ✅ GOOD
const STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
} as const;
type Status = (typeof STATUS)[keyof typeof STATUS]; // 'pending' | 'completed'

// ❌ BAD
enum Status {
  PENDING = "pending",
  COMPLETED = "completed",
}
```

## Avoid using `as` for type assertions; use satisfies instead

You should ALWAYS avoid using `as` for type assertions as it can lead to unsafe code.

Consider, using the `satisfies` operator to ensure that the object conforms to the desired type without changing its inferred type.

```typescript
// ✅ GOOD
const config = {
  host: "localhost",
  port: 8080,
} satisfies ServerConfig;

// ❌ BAD
const config = {
  host: "localhost",
  port: 8080,
} as ServerConfig;
```

## Generally avoid optional function parameters; prefer a single args object instead. Prefer all parameters to be required unless there is a very good reason otherwise.

```typescript
// ✅ GOOD
export function createUser(args: {
  name: string;
  email: string;
  isAdmin: boolean;
}) {
  // implementation
}

// ❌ BAD
export function createUser(args: {name: string, email: string, isAdmin?: boolean}) {
  // implementation
}
```

## Avoid destructuring function parameters; prefer using args object directly.

```typescript
// ✅ GOOD
export function printUser(args: {
  id: string;
  name: string;
  email: string;
}) {
    console.log(`User: ${args.name} (${args.email})`);
}

// ✅ GOOD
export function printUser(args: {
  id: string;
  name: string;
  address: {
    street: string;
    city: string;
  };
}) {
    console.log(`User: ${args.name}, Address: ${args.address.street}, ${args.address.city}`);
}

// ❌ BAD
export function printUser({ id, name, email }: {
  id: string;
  name: string;
  email: string;
}) {
    console.log(`User: ${name} (${email})`);
}

// ❌ BAD
export function printUser(args: { id, name, email }) {
    const { id, name, email } = args;
    console.log(`User: ${name} (${email})`);
}

// ❌ BAD
export function printUser(id: string, name: string, email: string) {
    console.log(`User: ${name} (${email})`);
}

// ❌ BAD
export function printUser(args: { id, name, email }) {
    const id = args.id;
    const name = args.name;
    const email = args.email;
    console.log(`User: ${name} (${email})`);
}
```

> [!NOTE] destructuring is ok occasionally on arrays
