"""Type protocols for type safety and interface contracts.

This module defines a structural typing protocol used for better type checking
when working with file-like objects and HTTP request handlers.

Protocols:
    - SupportsWrite: Describes any object with the `write()` method (e.g. file, socket).

This is especially useful when working with `cast()` to ensure compatibility and
with `shutil.copyfileobj`.
"""
from typing import TypeVar, Protocol

_T_contra = TypeVar("_T_contra", contravariant=True)


class SupportsWrite(Protocol[_T_contra]):
    """The protocol for writable objects.

        Any object that implements the `write(s)` method and can accept data of type `_T_contra`.

        Example use:
            Used with `shutil.copyfileobj` where destination must support `.write()`.

        Methods:
            write(s): Writes a value of type `_T_contra` to the underlying stream.

        Args:
            s (_T_contra): The data to write.

        Returns:
            object: Typically returns the number of bytes written or `None`.
    """
    def write(self, s: _T_contra, /) -> object: ...