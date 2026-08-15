pub mod types;

pub use types::{EdgeData, NodeData, NodeId, Stream};

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
