export function byteConversion(bytes: number | undefined, decimals = 2): string {

    if (bytes === 0 || bytes === undefined) return '0';

    const kiloByte = 1024;
    const decimal = Math.max(decimals, 0);
    const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i: number = Math.floor(Math.log(bytes) / Math.log(kiloByte));

    return `${Number.parseFloat((bytes / kiloByte ** i).toFixed(decimal))} ${sizes[i]}`;
}
